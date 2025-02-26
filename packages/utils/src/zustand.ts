/**
 * A utility type that overwrites properties in T with properties from U.
 * @template T - The original type
 * @template U - The type containing properties to overwrite with
 */
export type Write<T, U> = Omit<T, keyof U> & U;

/**
 * Interface for a store that supports subscribing to state changes with selector support.
 * @template T - The type of the store's state
 */
export interface StoreSubscribeWithSelector<T> {
  subscribe: {
    /**
     * Subscribe to all state changes
     * @param listener - Callback called with the new and previous state values
     * @returns Unsubscribe function
     */
    (listener: (selectedState: T, previousSelectedState: T) => void): () => void;

    /**
     * Subscribe to changes in a selected portion of the state
     * @template U - The type of the selected state portion
     * @param selector - Function to select a portion of the state
     * @param listener - Callback called with the new and previous selected values
     * @param options - Configuration options for the subscription
     * @returns Unsubscribe function
     */
    <U>(
      selector: (state: T) => U,
      listener: (selectedState: U, previousSelectedState: U) => void,
      options?: {
        equalityFn?: (a: U, b: U) => boolean;
        fireImmediately?: boolean;
      },
    ): () => void;
  };
}
