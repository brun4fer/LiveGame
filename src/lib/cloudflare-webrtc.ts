export type BrowserWebRtcSession = {
  peer: RTCPeerConnection;
  sessionUrl: string | null;
};

async function negotiate(peer: RTCPeerConnection, endpoint: string) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offer.sdp,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`WebRTC negotiation failed (${response.status}).`);
  const answer = await response.text();
  await peer.setRemoteDescription({ type: "answer", sdp: answer });
  const location = response.headers.get("Location");
  return location ? new URL(location, endpoint).toString() : null;
}

export async function publishCameraStream(stream: MediaStream, endpoint: string): Promise<BrowserWebRtcSession> {
  const peer = new RTCPeerConnection();
  try {
    for (const track of stream.getTracks()) peer.addTransceiver(track, { direction: "sendonly" });
    return { peer, sessionUrl: await negotiate(peer, endpoint) };
  } catch (error) {
    peer.close();
    throw error;
  }
}

export async function receiveCameraStream(endpoint: string): Promise<BrowserWebRtcSession & { stream: MediaStream }> {
  const peer = new RTCPeerConnection();
  const stream = new MediaStream();
  try {
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.addTransceiver("audio", { direction: "recvonly" });
    peer.ontrack = (event) => stream.addTrack(event.track);
    return { peer, stream, sessionUrl: await negotiate(peer, endpoint) };
  } catch (error) {
    peer.close();
    throw error;
  }
}

export function closeWebRtcSession(session: BrowserWebRtcSession | null) {
  if (!session) return;
  session.peer.ontrack = null;
  session.peer.close();
  if (session.sessionUrl) void fetch(session.sessionUrl, { method: "DELETE" }).catch(() => undefined);
}
