export function localDateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
export function localTimeInputValue(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}
export function combineLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}
export function formatClock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
export function relativeFromNow(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hrs ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""}, ${hrs % 24} hrs ago`;
}
export function babyAgeText(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const days = Math.max(0, Math.floor((Date.now() - birth.getTime()) / 86_400_000));
  if (days < 7) return `${days}-Day-Old Baby`;
  const weeks = Math.floor(days / 7);
  return `${weeks}-Week-Old Baby`;
}
export function babyAgeSentence(name: string, birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const days = Math.max(0, Math.floor((Date.now() - birth.getTime()) / 86_400_000));
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return `Today ${name} is ${weeks} Week${weeks === 1 ? "" : "s"}, ${rem} Day${rem === 1 ? "" : "s"} old.`;
}
