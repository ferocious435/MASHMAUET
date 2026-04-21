export class ApplicationError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ApplicationError";
    this.statusCode = statusCode;
  }
}
