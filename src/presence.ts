// 全局最多 N 个 live UI(默认3)。用"持续连接"占位:每个聊天窗口开一条常驻连接,
// 连接活着=占一个位,窗口关闭/离开=连接断开=立即释放。不靠定时心跳,免受后台标签限流影响。
const CAP = Number(process.env.MAX_LIVE_UIS ?? "3");
const active = new Set<string>();

// 占位:已持有则续用;满了且是新的则拒绝。
export function claim(id: string): boolean {
  if (active.has(id)) return true;
  if (active.size >= CAP) return false;
  active.add(id);
  return true;
}
export function release(id: string) {
  active.delete(id);
}
export function count(): number {
  return active.size;
}
export function hasCapacity(): boolean {
  return active.size < CAP;
}
export const capacity = CAP;
