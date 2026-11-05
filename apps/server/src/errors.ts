export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function conflict(message = "This prospect changed. Refresh it and try again."): never {
  throw new AppError(409, "CONFLICT", message);
}
