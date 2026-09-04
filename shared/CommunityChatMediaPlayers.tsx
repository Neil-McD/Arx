export type CommunityChatMediaTrack = {
  id?: string;
  url: string;
  name: string;
};

type CommunityChatMediaPlayersProps = {
  videos?: CommunityChatMediaTrack[];
  audios?: CommunityChatMediaTrack[];
  className?: string;
};

export function CommunityChatMediaPlayers({
  videos = [],
  audios = [],
  className = "",
}: CommunityChatMediaPlayersProps) {
  if (videos.length === 0 && audios.length === 0) return null;

  const rootClassName = `chat-media-players${className ? ` ${className}` : ""}`;

  return (
    <div className={rootClassName}>
      {videos.length > 0 ? <div className="message-media-grid">
      {videos.map((video, index) => (
        <div className="chat-media-player chat-media-player-video" key={video.id || `video-${index}-${video.url}`}>
          <video controls preload="metadata" src={video.url} aria-label={video.name} />
          <span className="chat-media-player-name" title={video.name}>
            {video.name}
          </span>
        </div>
      ))}
      </div> : null}
      {audios.map((audio, index) => (
        <div className="chat-media-player chat-media-player-audio" key={audio.id || `audio-${index}-${audio.url}`}>
          <span className="chat-media-player-name" title={audio.name}>
            {audio.name}
          </span>
          <audio controls preload="metadata" src={audio.url} aria-label={audio.name} />
        </div>
      ))}
    </div>
  );
}
