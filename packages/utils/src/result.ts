/**
 * A class representing a Result type that can either contain a success value of type T
 * or an error value of type E. This implementation is inspired by Rust's Result type.
 *
 * @typeParam T - The type of the success value
 * @typeParam E - The type of the error value, defaults to Error
 *
 * @example
 * ```typescript
 * // Creating a success result
 * const okResult = Result.Ok<number, string>(42);
 *
 * // Creating an error result
 * const errResult = Result.Err<number, string>("something went wrong");
 *
 * // Using map to transform the success value
 * const doubled = okResult.map(x => x * 2);
 *
 * // Using match to handle both cases
 * const output = result.match(
 *   value => `Success: ${value}`,
 *   error => `Error: ${error}`
 * );
 * ```
 *
 * @remarks
 * This class provides a way to handle operations that might fail, making error handling more explicit
 * and type-safe. It includes methods for transforming, combining, and extracting values in a safe manner.
 *
 * The Result type is immutable - all transformation methods return a new Result instance.
 */
export class Result<T, E = Error> {
  private constructor(
    readonly value?: T,
    readonly error?: E,
  ) {}

  /**
   * Creates a new Result instance with a success value
   * @template T The type of the success value
   * @template E The type of the error value
   * @param value The success value
   * @returns A new Result instance containing the success value
   */
  static Ok<T, E>(value: T): Result<T, E> {
    return new Result(value);
  }

  /**
   * Creates a new Result instance with an error value
   * @template T The type of the success value
   * @template E The type of the error value
   * @param error The error value
   * @returns A new Result instance containing the error value
   */
  static Err<T, E>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error);
  }

  /**
   * Creates a new Result instance with an Error created from a string message
   * @template T The type of the success value
   * @param errorMessage The error message string
   * @returns A new Result instance containing an Error with the given message
   */
  static ErrFromStr<T>(errorMessage: string): Result<T> {
    const error = new Error(errorMessage);
    return new Result<T, Error>(undefined, error);
  }

  /**
   * Maps the success value to a new value using the provided function
   * @template U The type of the new success value
   * @param fn The mapping function
   * @returns A new Result with the mapped success value or the original error
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return this.isOk() ? Result.Ok(fn(this.value as T)) : Result.Err(this.error as E);
  }

  /**
   * Maps the error value to a new error using the provided function
   * @template F The type of the new error value
   * @param fn The mapping function
   * @returns A new Result with the mapped error value or the original success value
   */
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return this.isOk() ? Result.Ok(this.value as T) : Result.Err(fn(this.error as E));
  }

  /**
   * Chains a computation that returns a Result
   * @template U The type of the new success value
   * @param fn The function to chain
   * @returns The result of the chained function or the original error
   */
  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return this.isOk() ? fn(this.value as T) : Result.Err(this.error as E);
  }

  /**
   * Applies one of two functions depending on whether the Result is Ok or Err
   * @template U The type of the return value
   * @param ok The function to apply to the success value
   * @param err The function to apply to the error value
   * @returns The result of applying the appropriate function
   */
  match<U>(ok: (value: T) => U, err: (error: E) => U): U {
    return this.isOk() ? ok(this.value as T) : err(this.error as E);
  }

  /**
   * Checks if the Result contains a success value
   * @returns true if the Result contains a success value, false otherwise
   */
  isOk(): boolean {
    return this.error === undefined;
  }

  /**
   * Checks if the Result contains an error value
   * @returns true if the Result contains an error value, false otherwise
   */
  isErr(): boolean {
    return this.error !== undefined;
  }

  /**
   * Extracts the success value from the Result
   * @throws Error if the Result contains an error value
   * @returns The success value
   */
  unwrap(): T {
    if (this.isErr()) {
      throw new Error("Tried to unwrap an Err value");
    }
    return this.value as T;
  }

  /**
   * Returns the success value or a default value if the Result contains an error
   * @param defaultValue The value to return if the Result contains an error
   * @returns The success value or the default value
   */
  unwrapOr(defaultValue: T): T {
    return this.isOk() ? (this.value as T) : defaultValue;
  }

  /**
   * Extracts the error value from the Result
   * @throws Error if the Result contains a success value
   * @returns The error value
   */
  unwrapErr(): E {
    if (this.isOk()) {
      throw new Error("Tried to unwrap an Ok value");
    }
    return this.error as E;
  }

  /**
   * Converts the Result to a string representation
   * @returns A string representation of the Result
   */
  toString(): string {
    return this.isOk()
      ? `Ok(${typeof this.value === "object" ? JSON.stringify(this.value) : String(this.value)})`
      : `Err(${typeof this.error === "object" ? JSON.stringify(this.error) : String(this.error)})`;
  }
}
