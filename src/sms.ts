// 阿里云号码认证「短信认证服务」—— 手机号+验证码登录(仅测试用)。
// 验证码由阿里云生成/存储/校验,我们不自己管码。只给白名单里的手机号发码。
import Core from "@alicloud/pop-core";
import { config } from "./config.js";

let client: any = null;
function getClient(): any {
  if (!smsEnabled()) return null;
  if (!client) {
    client = new (Core as any)({
      accessKeyId: config.aliyunSms.accessKeyId,
      accessKeySecret: config.aliyunSms.accessKeySecret,
      endpoint: "https://dypnsapi.aliyuncs.com",
      apiVersion: "2017-05-25",
    });
  }
  return client;
}

export function smsEnabled(): boolean {
  return !!(config.aliyunSms.accessKeyId && config.aliyunSms.accessKeySecret);
}

// 手机号 -> userId;不在白名单返回 null。
export function phoneUserIdFor(phone: string): string | null {
  return config.aliyunSms.allowlist.get(phone.trim()) ?? null;
}

// 发送验证码。##code## 让阿里云自动生成 6 位码,5 分钟有效。
export async function sendSmsCode(phone: string): Promise<void> {
  const c = getClient();
  if (!c) throw new Error("短信未启用");
  const res = await c.request(
    "SendSmsVerifyCode",
    {
      PhoneNumber: phone,
      SignName: config.aliyunSms.signName,
      TemplateCode: config.aliyunSms.templateCode,
      TemplateParam: JSON.stringify({ code: "##code##", min: "5" }),
      CodeLength: 6,
      ValidTime: 300,
    },
    { method: "POST" }
  );
  if (!(res?.Success === true || res?.Code === "OK")) {
    throw new Error(res?.Message || "验证码发送失败");
  }
}

// 校验验证码。以 Model.VerifyResult === "PASS" 为准。
// 码错/已过期/无待校验码时阿里云会抛错或返回非 PASS,统一按"未通过"处理,
// 由调用方给出"验证码错误或已过期"的提示,不把它当系统故障。
export async function checkSmsCode(phone: string, code: string): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    const res = await c.request(
      "CheckSmsVerifyCode",
      { PhoneNumber: phone, VerifyCode: code },
      { method: "POST" }
    );
    return res?.Model?.VerifyResult === "PASS";
  } catch {
    return false;
  }
}
