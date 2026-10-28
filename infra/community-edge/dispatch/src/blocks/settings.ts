// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The Settings page of <polynet-personal page="settings">, served at
// /__polynet/blocks/settings.js on a site's private twin only (the site itself
// answers 404); personal.js loads it. It shows and edits what Studio's member
// settings do, and nothing account-wide beyond them: the member's profile (name,
// handle, bio, links, photo), this community's notifications, leaving it,
// signing out, and one link to Polynet's own account and billing settings.
// Every read and write goes to /__polynet/me/*, which answers only the twin's
// own session, and the backend runs Studio's own cores, so every rule (and every
// refusal) is Studio's. Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.

// Studio's wording for each refusal (shared/profileMutationErrors.ts; a test
// keeps them equal), plus the twin's own.
export const SETTINGS_MESSAGES: Record<string, string> = {
  profile_display_name_too_long: "Display name must be 120 characters or less.",
  profile_bio_too_long: "Bio must be 500 characters or less.",
  profile_handle_taken: "That handle is already taken.",
  profile_handle_empty: "Add a handle to continue.",
  profile_handle_reserved: "That handle is reserved.",
  profile_handle_too_short: "Handle must be at least 3 characters.",
  profile_handle_too_long: "Handle must be 32 characters or less.",
  profile_handle_invalid_format: "Handle can use lowercase letters, numbers, underscores, and hyphens.",
  profile_avatar_invalid: "Upload a valid profile photo and try again.",
  profile_link_invalid_youtube: "Enter a valid YouTube profile URL.",
  profile_link_invalid_x: "Enter a valid X profile URL.",
  profile_link_invalid_instagram: "Enter a valid Instagram profile URL.",
  community_owner_cannot_leave: "Owners can't leave their own community.",
  not_a_member: "You're no longer a member of this community.",
  request_too_large: "That's too long to save.",
};

export const SETTINGS_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block module: the Settings page of <polynet-personal page="settings">.
// Only on a site's private twin. Style it with ::part() on <polynet-personal>:
// settings, section, section-title, field, label, input, hint, field-error,
// avatar, avatar-upload, avatar-remove, avatar-status, save, status, error,
// switch-row, switch, leave, leave-confirm, signout, account-link.
import { h, styled, avatar } from "/__polynet/blocks/kit.js";
import polynet from "/__polynet/sdk.js";

const STYLE = [
  ".settings { display: grid; gap: 2.25em; }",
  ".section { display: grid; gap: 1em; margin: 0; padding: 0 0 2.25em; border-bottom: 1px solid var(--pn-border); }",
  ".section:last-child { border-bottom: 0; padding-bottom: 0; }",
  ".section h2 { margin: 0; font-size: 1.125em; line-height: 1.3; }",
  ".section-body { display: grid; gap: 1em; }",
  ".lead { margin: -.5em 0 0; color: var(--pn-muted); font-size: .9375em; line-height: 1.5; }",
  ".field { display: grid; gap: .35em; }",
  ".label { font-weight: 600; font-size: .875em; }",
  ".input { font: inherit; color: inherit; background: var(--pn-surface); width: 100%; min-height: 2.75em; padding: .55em .75em;",
  "  border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); }",
  ".input:focus-visible { outline: 2px solid var(--pn-accent); outline-offset: 1px; }",
  "textarea.input { min-height: 6.5em; resize: vertical; line-height: 1.5; }",
  ".input[aria-invalid=true] { border-color: var(--pn-danger); }",
  ".at { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; }",
  ".at > span { padding: 0 .5em 0 0; color: var(--pn-muted); }",
  ".hint { margin: 0; font-size: .8125em; color: var(--pn-muted); line-height: 1.45; }",
  ".field-error, .error { margin: 0; font-size: .875em; color: var(--pn-danger); line-height: 1.45; }",
  ".links { display: grid; gap: .75em 1em; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14em), 1fr)); }",
  ".photo { display: flex; flex-wrap: wrap; align-items: center; gap: .75em 1.25em; }",
  ".photo .face { width: 4.5em; flex: none; }",
  ".row { display: flex; flex-wrap: wrap; align-items: center; gap: .75em 1.25em; }",
  ".secondary { background: none; color: inherit; border: 1px solid var(--pn-border); border-radius: 999px; padding: .45em 1em; font-weight: 600; min-height: 2.5em; }",
  ".danger { background: none; color: var(--pn-danger); border: 1px solid currentColor; border-radius: 999px; padding: .45em 1.1em; font-weight: 600; min-height: 2.5em; }",
  ".danger.solid { background: var(--pn-danger); color: #fff; border-color: var(--pn-danger); }",
  "button:disabled { opacity: .6; cursor: progress; }",
  ".switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .2em 1.25em; align-items: center; }",
  ".switch-row .hint { grid-column: 1; }",
  ".switch { grid-row: span 2; position: relative; width: 2.9em; height: 1.7em; padding: 0; border: 0; border-radius: 999px; background: var(--pn-border); }",
  ".switch .thumb { position: absolute; top: .2em; left: .2em; width: 1.3em; height: 1.3em; border-radius: 50%; background: var(--pn-surface); box-shadow: 0 1px 2px rgba(0,0,0,.3); }",
  ".switch[aria-checked=true] { background: var(--pn-accent); }",
  ".switch[aria-checked=true] .thumb { transform: translateX(1.2em); }",
  "@media (prefers-reduced-motion: no-preference) { .switch, .switch .thumb { transition: background .15s, transform .15s; } }",
  ".confirm { display: grid; gap: .75em; padding: 1em 1.125em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".confirm p { margin: 0; }",
  "@media (pointer: coarse) { .secondary, .danger, .switch { min-height: 44px; } .switch { width: 3.4em; } }",
  // Errors in red unless the site says otherwise.
  ":host { --pn-danger: var(--polynet-danger, #c0392b); }",
].join("\n");

const MESSAGES = __POLYNET_SETTINGS_MESSAGES__;
// Which field a refusal is about, so the message sits under it.
const FIELD_OF = {
  profile_display_name_too_long: "display_name", profile_bio_too_long: "bio", profile_link_invalid_youtube: "youtube",
  profile_link_invalid_x: "x", profile_link_invalid_instagram: "instagram",
};
function fieldOf(code) {
  return code.indexOf("profile_handle_") === 0 ? "handle" : FIELD_OF[code] || null;
}
function message(code, fallback) {
  return (code && MESSAGES[code]) || fallback;
}

const LINKS = [["youtube", "YouTube", "youtube.com/@handle"], ["x", "X", "x.com/handle"], ["instagram", "Instagram", "instagram.com/handle"]];
// Studio's photo: at most 1024px on its longest edge, re-encoded (which also
// drops what the camera wrote into the file, like where it was taken).
const PHOTO_EDGE = 1024;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const HANDLE_CHECK_MS = 260;

// GET for reads, a small JSON POST for writes. { status, body }; status 0 offline.
async function call(path, body) {
  try {
    const init = body === undefined ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(path, init);
    const data = await res.json().catch(() => null);
    return { status: res.status, body: data && typeof data === "object" ? data : {} };
  } catch (error) {
    return { status: 0, body: {} };
  }
}
const ok = (res) => res.status === 200 && res.body.ok === true;

async function shrink(file) {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/webp", 0.92));
}

let counter = 0;

class Settings {
  constructor(block, generation) {
    this.block = block;
    this.generation = generation;
    this.id = "pn-settings-" + (++counter);
    this.handleTimer = 0;
    this.handleCheck = 0;
  }

  current() {
    return this.generation === this.block.generation;
  }

  async load() {
    const res = await call("/__polynet/me/settings");
    if (!this.current()) return;
    if (res.status === 401) return this.block.signedOut("Sign in to change your settings.");
    if (res.status === 403 && res.body.code === "not_a_member") {
      return this.block.show("not-member", [h("div", { class: "state", part: "empty" }, [
        h("p", { text: MESSAGES.not_a_member }),
        h("a", { class: "quiet", href: "/communities", text: "Your communities" }),
      ])]);
    }
    if (!ok(res) || !res.body.profile || !res.body.community || !res.body.notifications) {
      return this.block.show("error", [h("div", { class: "state", role: "alert" }, [
        h("p", { text: "Couldn't load your settings." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.block.load(), text: "Try again" }),
      ])]);
    }
    this.data = res.body;
    this.block.show("ready", [h("div", { class: "settings", part: "settings" }, [
      this.profileSection(), this.notificationsSection(), this.leaveSection(), this.signOutSection(), this.accountSection(),
    ])]);
  }

  section(key, title, lead, children) {
    const heading = this.id + "-" + key;
    return h("section", { class: "section", part: "section section-" + key, "aria-labelledby": heading }, [
      h("h2", { id: heading, part: "section-title", text: title }),
      lead ? h("p", { class: "lead", text: lead }) : null,
      ...children,
    ]);
  }

  // A labelled field with its hint and its own error line, both read with it.
  field(key, label, control, hint) {
    const id = this.id + "-" + key;
    control.id = id;
    const error = h("p", { class: "field-error", part: "field-error", id: id + "-error", hidden: true });
    const describedBy = [hint ? id + "-hint" : null, id + "-error"].filter(Boolean).join(" ");
    control.setAttribute("aria-describedby", describedBy);
    if (hint) hint.id = id + "-hint";
    this.fields[key] = { control: control, error: error };
    return h("div", { class: "field", part: "field field-" + key }, [
      h("label", { class: "label", part: "label", for: id, text: label }),
      key === "handle" ? h("div", { class: "at" }, [h("span", { "aria-hidden": "true", text: "@" }), control]) : control,
      hint, error,
    ]);
  }

  input(attrs, value) {
    const node = h(attrs.rows ? "textarea" : "input", Object.assign({ class: "input", part: "input" }, attrs));
    node.value = value || "";
    return node;
  }

  profileSection() {
    const profile = this.data.profile;
    this.fields = {};
    const name = this.input({ type: "text", name: "display_name", maxlength: "120", autocomplete: "name" }, profile.display_name);
    const handle = this.input({ type: "text", name: "handle", maxlength: "40", autocapitalize: "none", autocorrect: "off", spellcheck: "false", autocomplete: "username" }, profile.handle);
    const bio = this.input({ name: "bio", rows: "4", maxlength: "500" }, profile.bio);
    const handleHint = h("p", { class: "hint", part: "hint", "aria-live": "polite" });
    handle.addEventListener("input", () => this.checkHandle(handle, handleHint));
    const links = LINKS.map((link) => this.field(link[0], link[1], this.input({ type: "url", name: link[0], placeholder: link[2], inputmode: "url", autocomplete: "url" }, profile.social_links[link[0]])));
    this.status = h("p", { class: "hint", part: "status", role: "status" });
    this.alert = h("p", { class: "error", part: "error", role: "alert", hidden: true });
    this.save = h("button", { class: "primary", part: "save", type: "submit", text: "Save profile" });
    const form = h("form", { class: "section-body", novalidate: true, onsubmit: (event) => { event.preventDefault(); this.saveProfile(); } }, [
      this.photoRow(),
      this.field("display_name", "Name", name),
      this.field("handle", "Handle", handle, handleHint),
      this.field("bio", "Bio", bio),
      h("div", { class: "links" }, links),
      h("div", { class: "row" }, [this.save, this.status]),
      this.alert,
    ]);
    form.addEventListener("input", () => { if (!this.saving) this.status.textContent = ""; });
    return this.section("profile", "Your profile", "How you appear in every community on Polynet.", [form]);
  }

  // Studio's handle check, as the member types (their own handle counts as free).
  checkHandle(input, hint) {
    clearTimeout(this.handleTimer);
    const check = ++this.handleCheck;
    hint.textContent = "";
    const value = input.value.trim();
    if (!value || value.replace(/^@+/, "").toLowerCase() === (this.data.profile.handle || "")) return;
    this.handleTimer = setTimeout(async () => {
      const res = await call("/__polynet/me/handle?handle=" + encodeURIComponent(value));
      if (check !== this.handleCheck || !this.current() || !ok(res)) return;
      hint.textContent = res.body.available ? "@" + res.body.handle + " is available." : message("profile_handle_" + res.body.status, "That handle can't be used.");
    }, HANDLE_CHECK_MS);
  }

  clearErrors() {
    this.alert.hidden = true;
    this.alert.textContent = "";
    for (const key of Object.keys(this.fields)) {
      const field = this.fields[key];
      field.error.hidden = true;
      field.error.textContent = "";
      field.control.removeAttribute("aria-invalid");
    }
  }

  showError(code, fallback) {
    const field = this.fields[fieldOf(code || "")];
    const text = message(code, fallback);
    if (field) {
      field.error.textContent = text;
      field.error.hidden = false;
      field.control.setAttribute("aria-invalid", "true");
      field.control.focus();
    } else {
      this.alert.textContent = text;
      this.alert.hidden = false;
    }
  }

  // What the member typed stays put on any refusal; only a save shows Studio's normalized values.
  async saveProfile() {
    if (this.saving) return;
    this.saving = true;
    this.clearErrors();
    this.save.disabled = true;
    this.save.textContent = "Saving…";
    this.status.textContent = "Saving…";
    const value = (key) => this.fields[key].control.value;
    const keys = ["display_name", "handle", "bio"].concat(LINKS.map((link) => link[0]));
    const submitted = {};
    for (const key of keys) submitted[key] = value(key);
    const res = await call("/__polynet/me/profile", {
      display_name: submitted.display_name, handle: submitted.handle, bio: submitted.bio,
      social_links: { youtube: submitted.youtube, x: submitted.x, instagram: submitted.instagram },
    });
    if (!this.current()) return;
    this.saving = false;
    this.save.disabled = false;
    this.save.textContent = "Save profile";
    this.status.textContent = "";
    if (res.status === 401) return this.showError(null, "You were signed out. Sign in again to save.");
    if (!ok(res) || !res.body.profile) return this.showError(res.body.code, "That didn't save. Try again.");
    const profile = res.body.profile;
    this.data.profile = profile;
    const saved = { display_name: profile.display_name, handle: profile.handle, bio: profile.bio };
    for (const link of LINKS) saved[link[0]] = profile.social_links[link[0]];
    // Fields edited while the save was in flight keep the newer text.
    let edited = false;
    for (const key of keys) {
      if (value(key) !== submitted[key]) edited = true;
      else this.fields[key].control.value = saved[key] || "";
    }
    this.status.textContent = edited ? "Saved. Save again to keep your newer edits." : "Saved.";
  }

  photoRow() {
    const profile = this.data.profile;
    this.face = h("span", { class: "face", part: "avatar" }, [avatar({ avatar_url: profile.avatar_url }, profile.display_name || profile.handle)]);
    const file = h("input", { type: "file", accept: "image/*", class: "sr", tabindex: "-1", "aria-hidden": "true" });
    file.addEventListener("change", () => {
      const picked = file.files && file.files[0];
      file.value = "";
      if (picked) this.uploadPhoto(picked);
    });
    this.upload = h("button", { class: "secondary", part: "avatar-upload", type: "button", text: "Upload photo", onclick: () => file.click() });
    this.remove = h("button", { class: "quiet", part: "avatar-remove", type: "button", text: "Remove photo", hidden: !profile.avatar_url, onclick: () => this.setPhoto(null) });
    this.photoStatus = h("p", { class: "hint", part: "avatar-status", role: "status" });
    return h("div", { class: "photo" }, [this.face, h("div", { class: "row" }, [this.upload, this.remove, file]), this.photoStatus]);
  }

  photoBusy(busy, text) {
    this.upload.disabled = busy;
    this.remove.disabled = busy;
    this.photoStatus.textContent = text;
  }

  // Studio's flow: an upload address, the file straight to Polynet's storage, then confirm it.
  async uploadPhoto(file) {
    if (!/^image\//.test(file.type || "")) return this.photoBusy(false, "Choose an image file.");
    this.photoBusy(true, "Uploading…");
    let blob = null;
    try {
      blob = await shrink(file);
    } catch (error) {
      blob = null;
    }
    if (!blob) return this.photoBusy(false, "Couldn't read that image. Try another one.");
    if (blob.size > PHOTO_MAX_BYTES) return this.photoBusy(false, "That photo is too large. Try a smaller image.");
    const issued = await call("/__polynet/me/avatar/upload", {});
    if (!this.current()) return;
    if (!ok(issued) || typeof issued.body.upload_url !== "string") return this.photoBusy(false, message(issued.body.code, "The photo didn't upload. Try again."));
    let storageId = null;
    try {
      const res = await fetch(issued.body.upload_url, { method: "POST", headers: { "Content-Type": blob.type || "image/png" }, body: blob });
      const data = await res.json().catch(() => null);
      storageId = res.ok && data && typeof data.storageId === "string" ? data.storageId : null;
    } catch (error) {
      storageId = null;
    }
    if (!this.current()) return;
    if (!storageId) return this.photoBusy(false, "The photo didn't upload. Try again.");
    await this.setPhoto(storageId);
  }

  async setPhoto(storageId) {
    this.photoBusy(true, storageId ? "Saving photo…" : "Removing photo…");
    const res = await call("/__polynet/me/avatar", { storage_id: storageId });
    if (!this.current()) return;
    if (!ok(res) || !res.body.profile) return this.photoBusy(false, message(res.body.code, "That didn't save. Try again."));
    const profile = res.body.profile;
    this.data.profile.avatar_url = profile.avatar_url;
    this.face.replaceChildren(avatar({ avatar_url: profile.avatar_url }, profile.display_name || profile.handle));
    this.remove.hidden = !profile.avatar_url;
    this.photoBusy(false, storageId ? "Photo updated." : "Photo removed.");
  }

  notificationsSection() {
    const name = this.data.community.name || "this community";
    const notifications = this.data.notifications;
    this.notifyStatus = h("p", { class: "hint", part: "status", role: "status" });
    this.notifyAlert = h("p", { class: "error", part: "error", role: "alert", hidden: true });
    const muteHint = (on) => (on ? "This community is muted for your account." : "Reduce notifications and attention markers from this community.");
    return this.section("notifications", "Notifications", null, [
      this.switchRow("muted", "Mute " + name, muteHint, notifications.muted === true),
      this.switchRow("weekly_digest", "Weekly community digest",
        () => "A weekly summary of activity from communities you belong to. One setting for all of them.", notifications.weekly_digest !== false),
      this.notifyStatus, this.notifyAlert,
    ]);
  }

  switchRow(key, title, hint, on) {
    const id = this.id + "-" + key;
    const describe = h("p", { class: "hint", id: id + "-hint", text: hint(on) });
    const button = h("button", {
      class: "switch", part: "switch switch-" + key, type: "button", role: "switch", "aria-checked": on ? "true" : "false",
      "aria-labelledby": id + "-label", "aria-describedby": id + "-hint",
      onclick: () => this.toggle(key, button, describe, hint),
    }, [h("span", { class: "thumb", "aria-hidden": "true" })]);
    return h("div", { class: "switch-row", part: "switch-row" }, [h("span", { class: "label", id: id + "-label", text: title }), button, describe]);
  }

  // Each switch saves at once, as in Studio; a refusal puts it back.
  async toggle(key, button, describe, hint) {
    if (button.disabled) return;
    const next = button.getAttribute("aria-checked") !== "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-checked", next ? "true" : "false");
    this.notifyAlert.hidden = true;
    this.notifyStatus.textContent = "Saving…";
    const body = {};
    body[key] = next;
    const res = await call("/__polynet/me/notifications", body);
    if (!this.current()) return;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    const saved = ok(res) && res.body.notifications && res.body.notifications[key] === next;
    this.notifyStatus.textContent = saved ? "Saved." : "";
    if (!saved) {
      button.setAttribute("aria-checked", next ? "false" : "true");
      this.notifyAlert.textContent = res.status === 401 ? "You were signed out. Sign in again to change this." : message(res.body.code, "That didn't save. Try again.");
      this.notifyAlert.hidden = false;
      return;
    }
    describe.textContent = hint(next);
  }

  leaveSection() {
    const name = this.data.community.name || "this community";
    if (this.data.community.role === "owner") {
      return this.section("leave", "Leave this community", null, [
        h("p", { class: "lead", part: "leave-owner", text: "You own " + name + ". " + MESSAGES.community_owner_cannot_leave }),
      ]);
    }
    const area = h("div", { class: "leave-area" });
    const start = () => {
      const alert = h("p", { class: "error", part: "error", role: "alert", hidden: true });
      const question = h("p", { tabindex: "-1", text: "Leave " + name + "? You'll lose access immediately." });
      const cancel = h("button", { class: "quiet", type: "button", text: "Cancel", onclick: () => { area.replaceChildren(button); button.focus(); } });
      const confirm = h("button", { class: "danger solid", part: "leave-confirm", type: "button", text: "Leave " + name, onclick: async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        confirm.textContent = "Leaving…";
        alert.hidden = true;
        const res = await call("/__polynet/me/leave", {});
        if (!this.current()) return;
        if (ok(res)) { location.assign("/communities"); return; }
        confirm.disabled = false;
        cancel.disabled = false;
        confirm.textContent = "Leave " + name;
        alert.textContent = res.status === 401 ? "You were signed out. Sign in again to leave." : message(res.body.code, "That didn't work. Try again.");
        alert.hidden = false;
      } });
      area.replaceChildren(h("div", { class: "confirm", part: "leave-confirm-box", role: "group", "aria-label": "Confirm leaving" }, [question, h("div", { class: "row" }, [confirm, cancel]), alert]));
      question.focus();
    };
    const button = h("button", { class: "danger", part: "leave", type: "button", text: "Leave community", onclick: start });
    area.append(button);
    return this.section("leave", "Leave this community", "Leave " + name + " and remove your member access.", [area]);
  }

  // Out of this site and these pages both: the site ends its own session on the
  // way back there (the edge hands over a one-time ticket for it).
  signOutSection() {
    const name = this.data.community.name || "this community";
    const alert = h("p", { class: "error", part: "error", role: "alert", hidden: true });
    const button = h("button", { class: "secondary", part: "signout", type: "button", text: "Sign out", onclick: async () => {
      button.disabled = true;
      let session = null;
      try { session = await polynet.session(); } catch (error) { session = null; }
      const site = session && typeof session.site_origin === "string" ? session.site_origin : null;
      let then = null;
      try {
        const res = await fetch("/__polynet/auth/logout", { method: "POST", credentials: "same-origin" });
        const body = await res.json();
        then = res.ok && body && typeof body.then === "string" ? body.then : null;
      } catch (error) {
        then = null;
      }
      if (then && site && then.indexOf(site + "/__polynet/auth/signout?") === 0) return location.assign(then);
      if (site) return location.assign(site + "/");
      button.disabled = false;
      alert.textContent = "Couldn't sign out. Try again.";
      alert.hidden = false;
    } });
    return this.section("signout", "Sign out", "Sign out of " + name + "'s site and these pages on this device.", [h("div", { class: "row" }, [button]), alert]);
  }

  accountSection() {
    const url = String(this.data.account_url || "");
    return this.section("account", "Your Polynet account", "Your email, sign-in and billing are kept in your Polynet account.", [
      /^https:\/\//.test(url) ? h("p", {}, [h("a", { class: "quiet", part: "account-link", href: url, text: "Account and billing on Polynet" })]) : null,
    ]);
  }
}

export function mountSettings(block, generation) {
  block.root.prepend(...styled(block.root, STYLE));
  return new Settings(block, generation).load();
}
`.replace("__POLYNET_SETTINGS_MESSAGES__", JSON.stringify(SETTINGS_MESSAGES));
