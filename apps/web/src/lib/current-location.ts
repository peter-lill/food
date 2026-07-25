export type CurrentLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type SearchLocationSource =
  | "current"
  | "home"
  | "temporary"
  | "fallback";

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was denied. Allow location access in your browser, then try again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your current location is unavailable. Try moving somewhere with a clearer GPS or network signal.";
  }
  if (error.code === error.TIMEOUT) {
    return "Finding your current location took too long. Try again.";
  }
  return "Your current location could not be determined.";
}

export function getCurrentLocation(): Promise<CurrentLocation> {
  if (!navigator.geolocation) {
    return Promise.reject(
      new Error("This browser cannot provide your current location."),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => reject(new Error(geolocationErrorMessage(error))),
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 12_000,
      },
    );
  });
}
