import { ApplicationError } from "../errors/application-error.ts";

export interface HttpContext {
  body?: unknown;
  params: Record<string, string>;
}

export interface HttpResult {
  statusCode: number;
  body: unknown;
}

export abstract class BaseController {
  protected ok<T>(payload: T, statusCode = 200): HttpResult {
    return {
      statusCode,
      body: payload,
    };
  }

  protected fail(error: unknown): HttpResult {
    if (error instanceof ApplicationError) {
      return {
        statusCode: error.statusCode,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    }

    if (error instanceof Error) {
      return {
        statusCode: 500,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    }

    return {
      statusCode: 500,
      body: {
        error: "UnknownError",
        message: "Unexpected error.",
      },
    };
  }
}
