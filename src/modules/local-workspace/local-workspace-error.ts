export class LocalWorkspaceError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(statusCode: number, code: string, message: string, expose = true) {
    super(message);
    this.name = "LocalWorkspaceError";
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }
}

export function asPublicError(error: unknown): { statusCode: number; code: string; message: string } {
  if (error instanceof LocalWorkspaceError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.expose ? error.message : "Внутренняя ошибка локального сервера",
    };
  }
  if (isNotFoundError(error)) return { statusCode: 404, code: "not_found", message: "Объект не найден" };
  return { statusCode: 500, code: "internal_error", message: "Внутренняя ошибка локального сервера" };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}
