// Converts radians to degrees for the slider display
export const toDegrees = (radians: number) => radians * (180 / Math.PI);

// Converts degrees to radians for updating the THREE.Euler object
export const toRadians = (degrees: number) => degrees * (Math.PI / 180);
