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
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (hrs % 24 === 0) return `${days} ngày trước`;
  return `${days} ngày ${hrs % 24} giờ trước`;
}
export function babyAgeText(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const days = Math.max(0, Math.floor((Date.now() - birth.getTime()) / 86_400_000));
  if (days < 7) return `${days} ngày tuổi`;
  const weeks = Math.floor(days / 7);
  return `${weeks} tuần tuổi`;
}
export function babyAgeSentence(name: string, birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const days = Math.max(0, Math.floor((Date.now() - birth.getTime()) / 86_400_000));
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  if (weeks === 0) return `Hôm nay ${name} tròn ${rem} ngày tuổi.`;
  return `Hôm nay ${name} được ${weeks} tuần${rem ? ` và ${rem} ngày` : ""}.`;
}
