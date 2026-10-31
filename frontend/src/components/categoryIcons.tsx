import { Bike, Bus, Car, Footprints, Plane, Ship, Train, Truck, Users, BedDouble, TrainFront, HandHeart, Home, Sailboat, Tent } from "lucide-react";

export function transportIconFor(value: string | null) {
  const size = 14;

  switch (value) {
    case "bike":
      return <Bike size={size} />;
    case "bus":
      return <Bus size={size} />;
    case "boat":
    case "ferry":
      return <Ship size={size} />;
    case "foot":
      return <Footprints size={size} />;
    case "plane":
      return <Plane size={size} />;
    case "train":
      return <Train size={size} />;
    case "truck":
      return <Truck size={size} />;
    case "friends":
      return <Users size={size} />;
    case "car":
    case "rentalCar":
    case "taxi":
    default:
      return <Car size={size} />;
  }
}

export function sleepIconFor(value: string | null) {
  const size = 14;

  switch (value) {
    case "camping":
    case "campingPaid":
      return <Tent size={size} />;
    case "boat":
      return <Sailboat size={size} />;
    case "nightbusNighttrain":
      return <TrainFront size={size} />;
    case "house":
    case "airbnb":
    case "renting":
      return <Home size={size} />;
    case "friends":
    case "couchsurfing":
      return <Users size={size} />;
    case "volunteering":
      return <HandHeart size={size} />;
    case "hostel":
    default:
      return <BedDouble size={size} />;
  }
}
