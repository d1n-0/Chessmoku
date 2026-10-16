export function downloadGame(game) {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: "five-crown-v1", exportedAt: new Date().toISOString(), game },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `chessmoku-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
