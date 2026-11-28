import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
  DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS,
  bindGlobalAttributionToCommunity,
  buildPolynetOutboundAppUrl,
  captureDistributionAttributionFromLocation,
  parseDistributionAttributionSearch,
  readPersistedDistributionAttribution,
  readPersistedDistributionAttributionForCommunity,
  resolveAcquisitionSource,
} from '../shared/distributionAttribution';

const AID = '6df50193-e11a-49cf-91e7-18e09ede226f';
const CID = '883c5850-e04d-4c60-9869-024102985541';

function stubBrowser(args: {
  pathname?: string;
  search?: string;
  origin?: string;
  referrer?: string;
  storage?: Map<string, string>;
}) {
  const values = args.storage ?? new Map<string, string>();
  vi.stubGlobal('window', {
    location: {
      pathname: args.pathname ?? '/',
      search: args.search ?? '',
      origin: args.origin ?? 'https://www.polynet.ai',
    },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  vi.stubGlobal('document', {
    referrer: args.referrer ?? '',
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe('Polynet distribution & acquisition attribution context', () => {
  it('accepts opaque DE UUIDs alongside standard campaign, referral, and external referrer signals', () => {
    expect(parseDistributionAttributionSearch(`?de_aid=${AID}&de_cid=${CID}`)).toEqual({
      anonymousId: AID,
      clickId: CID,
    });
    expect(parseDistributionAttributionSearch('?de_aid=email@example.com&de_cid=wrong')).toBeNull();
    expect(
      parseDistributionAttributionSearch(
        '?utm_source=YouTube&utm_medium=video&utm_campaign=spring-launch&utm_content=hook-a&ref=alex',
        { referrer: 'https://www.youtube.com/watch?v=123', currentOrigin: 'https://www.polynet.ai' },
      ),
    ).toEqual({
      utmSource: 'youtube',
      utmMedium: 'video',
      utmCampaign: 'spring-launch',
      utmContent: 'hook-a',
      referralCode: 'alex',
      referrerHost: 'youtube.com',
    });
    // Internal Polynet and auth/payment redirect referrers are ignored.
    expect(
      parseDistributionAttributionSearch('', {
        referrer: 'https://accounts.google.com/o/oauth2/auth',
        currentOrigin: 'https://www.polynet.ai',
      }),
    ).toBeNull();
    expect(
      parseDistributionAttributionSearch('', {
        referrer: 'https://www.polynet.ai/discover',
        currentOrigin: 'https://www.polynet.ai',
      }),
    ).toBeNull();
  });

  it('persists valid landing context, keeps platform signup DE-only, and isolates communities', () => {
    const storage = stubBrowser({
      pathname: '/c/alpha-club',
      search: `?de_aid=${AID}&de_cid=${CID}&utm_source=youtube&utm_campaign=launch-1`,
    });

    expect(captureDistributionAttributionFromLocation('alpha-club')).toEqual({
      anonymousId: AID,
      clickId: CID,
      utmSource: 'youtube',
      utmCampaign: 'launch-1',
    });
    expect(storage.has(DISTRIBUTION_ATTRIBUTION_STORAGE_KEY)).toBe(true);
    // Platform signup read stays DE-UUID-only for cached-client compatibility.
    expect(readPersistedDistributionAttribution()).toEqual({ anonymousId: AID, clickId: CID });
    // Community A keeps its full context; Community B never inherits Community A's attribution.
    expect(readPersistedDistributionAttributionForCommunity('alpha-club')).toEqual({
      anonymousId: AID,
      clickId: CID,
      utmSource: 'youtube',
      utmCampaign: 'launch-1',
    });
    expect(readPersistedDistributionAttributionForCommunity('beta-club')).toBeNull();
  });

  it('preserves attribution captured on /oauth/authorize across login and join detours', () => {
    const storage = stubBrowser({
      pathname: '/oauth/authorize',
      search: `?client_id=app_123&de_aid=${AID}&utm_source=newsletter&utm_campaign=welcome`,
      referrer: 'https://mycoolapp.com/pricing',
    });

    captureDistributionAttributionFromLocation();

    // User bounces to /login, then returns to /oauth/authorize without the original params.
    stubBrowser({
      pathname: '/oauth/authorize',
      search: '?client_id=app_123',
      referrer: 'https://www.polynet.ai/login',
      storage,
    });
    const bound = bindGlobalAttributionToCommunity('my-club');
    expect(bound).toEqual({
      anonymousId: AID,
      utmSource: 'newsletter',
      utmCampaign: 'welcome',
      referrerHost: 'mycoolapp.com',
    });

    // User clicks "Join community first" -> /c/my-club with no query params.
    stubBrowser({
      pathname: '/c/my-club',
      search: '?app=app_123',
      referrer: 'https://www.polynet.ai/oauth/authorize',
      storage,
    });
    expect(readPersistedDistributionAttributionForCommunity('my-club')).toEqual({
      anonymousId: AID,
      utmSource: 'newsletter',
      utmCampaign: 'welcome',
      referrerHost: 'mycoolapp.com',
    });
    // Another community still sees nothing.
    expect(readPersistedDistributionAttributionForCommunity('other-club')).toBeNull();
  });

  it('never leaks Community A scoped global attribution into an unscoped /oauth/authorize visit for Community B', () => {
    const storage = stubBrowser({
      pathname: '/c/alpha',
      search: `?de_aid=${AID}&de_cid=${CID}&utm_source=youtube&utm_campaign=alpha-vid`,
    });
    captureDistributionAttributionFromLocation('alpha');

    // Later, the same browser arrives at /oauth/authorize from Beta's external app.
    stubBrowser({
      pathname: '/oauth/authorize',
      search: '?client_id=app_beta',
      referrer: 'https://beta-app.example/pricing',
      storage,
    });
    captureDistributionAttributionFromLocation();
    const betaBound = bindGlobalAttributionToCommunity('beta');

    // Beta receives ONLY Beta's referrer; Alpha's DE IDs and campaign tags never bleed onto Beta.
    expect(betaBound).toEqual({ referrerHost: 'beta-app.example' });
    expect(readPersistedDistributionAttributionForCommunity('beta')).toEqual({
      referrerHost: 'beta-app.example',
    });
    // Alpha retains its own stored community attribution intact.
    expect(readPersistedDistributionAttributionForCommunity('alpha')).toEqual({
      anonymousId: AID,
      clickId: CID,
      utmSource: 'youtube',
      utmCampaign: 'alpha-vid',
    });
  });

  it('never lets a bare referrer revisit overwrite explicit campaign or DE attribution', () => {
    const storage = stubBrowser({
      pathname: '/c/alpha-club',
      search: `?de_aid=${AID}&utm_source=youtube&utm_campaign=ep-42`,
    });
    captureDistributionAttributionFromLocation('alpha-club');

    stubBrowser({
      pathname: '/c/alpha-club',
      search: '',
      referrer: 'https://google.com/',
      storage,
    });
    expect(captureDistributionAttributionFromLocation('alpha-club')).toEqual({
      anonymousId: AID,
      utmSource: 'youtube',
      utmCampaign: 'ep-42',
    });
  });

  it('does not attribute a new account to stale browser context', () => {
    const storage = new Map<string, string>([
      [
        DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({
          anonymousId: AID,
          clickId: CID,
          capturedAt: Date.now() - DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS - 1,
        }),
      ],
    ]);
    stubBrowser({ pathname: '/', search: '', storage });

    expect(readPersistedDistributionAttribution()).toBeNull();
  });

  it('resolves canonical acquisition sources with DE priority, UTM aliases, referrals, and referrers', () => {
    expect(resolveAcquisitionSource({ clickId: CID, utmSource: 'youtube', utmCampaign: 'v1' })).toEqual({
      source: 'distribution_engineer',
      label: 'Distribution Engineer',
      detail: 'v1',
      memberRecordLabel: 'Distribution Engineer · v1',
    });
    expect(resolveAcquisitionSource({ utmSource: 'yt', utmCampaign: 'spring-launch' })).toEqual({
      source: 'youtube',
      label: 'YouTube',
      detail: 'spring-launch',
      memberRecordLabel: 'YouTube · spring-launch',
    });
    expect(resolveAcquisitionSource({ utmSource: 'partner_alex' })).toEqual({
      source: 'utm:partner_alex',
      label: 'Partner Alex',
      detail: null,
      memberRecordLabel: 'Partner Alex',
    });
    expect(resolveAcquisitionSource({ referralCode: 'sarah' })).toEqual({
      source: 'referral',
      label: 'Referral',
      detail: 'sarah',
      memberRecordLabel: 'Referral · sarah',
    });
    expect(resolveAcquisitionSource({ referrerHost: 't.co' })).toEqual({
      source: 'x',
      label: 'X',
      detail: null,
      memberRecordLabel: 'X',
    });
    expect(resolveAcquisitionSource({ referrerHost: 'mycoolapp.com' })).toEqual({
      source: 'site:mycoolapp.com',
      label: 'mycoolapp.com',
      detail: null,
      memberRecordLabel: 'mycoolapp.com',
    });
    expect(resolveAcquisitionSource({})).toEqual({
      source: 'direct',
      label: 'Direct & organic',
      detail: null,
      memberRecordLabel: null,
    });
  });

  it('tags outbound connected-app URLs with Polynet source params without clobbering founder params', () => {
    expect(buildPolynetOutboundAppUrl('https://mycoolapp.com/dashboard', 'builders-club')).toBe(
      'https://mycoolapp.com/dashboard?utm_source=polynet&utm_medium=community&utm_campaign=builders-club&polynet_community=builders-club',
    );
    expect(
      buildPolynetOutboundAppUrl(
        'https://mycoolapp.com/start?utm_source=custom&foo=bar#welcome',
        'builders-club',
      ),
    ).toBe(
      'https://mycoolapp.com/start?utm_source=custom&foo=bar&utm_medium=community&utm_campaign=builders-club&polynet_community=builders-club#welcome',
    );
    expect(buildPolynetOutboundAppUrl('javascript:alert(1)', 'builders-club')).toBe(
      'javascript:alert(1)',
    );
  });
});
