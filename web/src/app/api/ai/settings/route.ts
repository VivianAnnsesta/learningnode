import {
  deletePersistedAiSettings,
  getAiSettingsView,
  writePersistedAiSettings,
  type AiSettingsInput
} from "../../../../lib/ai/settingsService";
import { isAiProviderName } from "../../../../lib/ai/provider";

export async function GET() {
  try {
    return Response.json(getAiSettingsView());
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取 AI 设置失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let payload: AiSettingsInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  const provider = payload.provider?.trim();
  if (!provider || !isAiProviderName(provider)) {
    return Response.json({ error: "无效的 AI 服务提供方" }, { status: 400 });
  }

  if (!payload.model?.trim()) {
    return Response.json({ error: "模型名称不能为空" }, { status: 400 });
  }

  try {
    writePersistedAiSettings(payload);
    return Response.json(getAiSettingsView());
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存 AI 设置失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    deletePersistedAiSettings();
    return Response.json(getAiSettingsView());
  } catch (error) {
    const message = error instanceof Error ? error.message : "重置 AI 设置失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
