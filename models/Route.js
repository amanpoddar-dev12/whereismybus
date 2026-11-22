import mongoose from 'mongoose';

const routeStopSchema = new mongoose.Schema(
  {
    stopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusStop',
      required: [true, 'stopId reference is required'],
    },
    sequence: {
      type: Number,
      required: [true, 'Stop sequence number is required'],
      min: [1, 'Sequence must be a 1-based positive integer'],
    },
    distanceFromPrevStopMeters: {
      type: Number,
      required: true,
      min: [0, 'Distance cannot be negative'],
      default: 0,
    },
    baseTravelTimeSeconds: {
      type: Number,
      required: true,
      min: [0, 'Base travel time cannot be negative'],
      default: 0,
    },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    routeId: {
      type: String,
      required: [true, 'routeId is required'],
      unique: true,
      trim: true,
      index: true,
    },
    routeName: {
      type: String,
      required: [true, 'routeName is required'],
      trim: true,
    },
    stops: {
      type: [routeStopSchema],
      default: [],
      validate: {
        validator: (stops) => {
          const sequences = new Set();
          const stopIds = new Set();
          for (const stop of stops) {
            if (sequences.has(stop.sequence)) return false;
            const idStr = String(stop.stopId);
            if (stopIds.has(idStr)) return false;
            sequences.add(stop.sequence);
            stopIds.add(idStr);
          }
          return true;
        },
        message: 'Route stops must have unique sequence numbers and unique stopIds (DAG constraint).',
      },
    },
    polylinePath: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

routeSchema.pre('save', function sortStopsAscending(next) {
  if (Array.isArray(this.stops) && this.stops.length > 1) {
    this.stops.sort((a, b) => a.sequence - b.sequence);
  }
  next();
});

const Route = mongoose.models.Route || mongoose.model('Route', routeSchema);

export default Route;
