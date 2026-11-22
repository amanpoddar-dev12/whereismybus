import mongoose from 'mongoose';

const busStopSchema = new mongoose.Schema(
  {
    stopId: {
      type: String,
      required: [true, 'stopId is required'],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Bus stop name is required'],
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: [true, 'GeoJSON coordinates [longitude, latitude] are required'],
        validate: {
          validator: (coords) =>
            Array.isArray(coords) &&
            coords.length === 2 &&
            Number.isFinite(coords[0]) &&
            Number.isFinite(coords[1]) &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90,
          message: 'Coordinates must be [longitude, latitude] within valid WGS84 bounds.',
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

busStopSchema.index({ location: '2dsphere' });

const BusStop = mongoose.models.BusStop || mongoose.model('BusStop', busStopSchema);

export default BusStop;
