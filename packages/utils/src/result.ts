export class Result<T, E = Error> {
  private constructor(
    readonly value?: T,
    readonly error?: E,
  ) {}

  // Existing static methods
  static Ok<T, E>(value: T): Result<T, E> {
    return new Result(value);
  }

  static Err<T, E>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error);
  }

  static ErrFromStr<T>(errorMessage: string): Result<T> {
    const error = new Error(errorMessage);
    return new Result<T, Error>(undefined, error);
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return this.isOk() ? Result.Ok(fn(this.value as T)) : Result.Err(this.error as E);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return this.isOk() ? Result.Ok(this.value as T) : Result.Err(fn(this.error as E));
  }

  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return this.isOk() ? fn(this.value as T) : Result.Err(this.error as E);
  }

  match<U>(ok: (value: T) => U, err: (error: E) => U): U {
    return this.isOk() ? ok(this.value as T) : err(this.error as E);
  }

  isOk(): boolean {
    return this.error === undefined;
  }

  isErr(): boolean {
    return this.error !== undefined;
  }

  unwrap(): T {
    if (this.isErr()) {
      throw new Error("Tried to unwrap an Err value");
    }
    return this.value as T;
  }

  unwrapOr(defaultValue: T): T {
    return this.isOk() ? (this.value as T) : defaultValue;
  }

  unwrapErr(): E {
    if (this.isOk()) {
      throw new Error("Tried to unwrap an Ok value");
    }
    return this.error as E;
  }

  // New utility method
  toString(): string {
    return this.isOk()
      ? `Ok(${typeof this.value === "object" ? JSON.stringify(this.value) : String(this.value)})`
      : `Err(${typeof this.error === "object" ? JSON.stringify(this.error) : String(this.error)})`;
  }
}
