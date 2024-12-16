/**
 * A Result type inspired by Rust's Result type.
 * Use Ok or Err to create a Result value.
 * If not specified, will use Error as the error type.
 */
export class Result<T, E = Error> {
  private constructor(
    readonly value?: T,
    readonly error?: E,
  ) {}

  static Ok<T, E>(value: T): Result<T, E> {
    return new Result(value);
  }

  static Err<T, E>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error);
  }

  static ErrFromStr<T>(errorMessage: string): Result<T> {
    return new Result<T>(undefined, new Error(errorMessage));
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
}
