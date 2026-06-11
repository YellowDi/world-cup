import { NextResponse } from "next/server";

import { DataInputError } from "@/lib/world-cup-repository";

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
const matchStatuses = new Set(["scheduled", "live", "finished"]);

export async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new DataInputError("请求 JSON 格式不正确");
  }
}

export function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataInputError("请求体必须是 JSON 对象");
  }

  return value as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = body[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new DataInputError(`${label}不能为空`);
  }

  return value.trim();
}

export function optionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new DataInputError(`${key}必须是字符串`);
  }

  return value.trim();
}

export function requiredPositiveNumber(
  body: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = Number(body[key]);

  if (!Number.isFinite(value) || value <= 0) {
    throw new DataInputError(`${label}必须大于 0`);
  }

  return value;
}

export function requiredNonNegativeNumber(
  body: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = Number(body[key]);

  if (!Number.isFinite(value) || value < 0) {
    throw new DataInputError(`${label}不能小于 0`);
  }

  return value;
}

export function requiredBoolean(
  body: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = body[key];

  if (typeof value !== "boolean") {
    throw new DataInputError(`${label}必须是布尔值`);
  }

  return value;
}

export function validateColor(color: string) {
  if (!hexColorPattern.test(color)) {
    throw new DataInputError("颜色必须是 #RRGGBB 格式");
  }

  return color;
}

export function validateMatchStatus(status: unknown) {
  if (typeof status !== "string" || !matchStatuses.has(status)) {
    throw new DataInputError("比赛状态不正确");
  }

  return status as "scheduled" | "live" | "finished";
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : null;

  if (error instanceof Error && status) {
    return NextResponse.json({ error: error.message }, { status });
  }

  if (error instanceof Error && error.message.includes("DATABASE_URL")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ error: "服务器处理失败" }, { status: 500 });
}
