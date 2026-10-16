export function createConnection({
  getSession,
  onOpen,
  onMessage,
  onClose,
  onError,
}) {
  let socket = null;
  let reconnectTimer = null;
  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
  function connect(initial) {
    if (socket?.readyState === WebSocket.OPEN) {
      if (initial) send(initial);
      return;
    }
    if (socket?.readyState === WebSocket.CONNECTING) return;
    clearTimeout(reconnectTimer);
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
    );
    socket.onopen = () => {
      const session = getSession();
      if (session) send({ type: "resume", ...session });
      else if (initial) send(initial);
      onOpen();
    };
    socket.onmessage = (event) => onMessage(JSON.parse(event.data));
    socket.onclose = (event) => {
      onClose(event.code);
      if (getSession()) reconnectTimer = setTimeout(() => connect(), 1500);
    };
    socket.onerror = onError;
  }
  return { connect, send };
}
