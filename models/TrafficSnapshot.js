import mongoose from 'mongoose';

export const TIME_SLOTS = Object.freeze({
  PEAK_MORNING: 'PEAK_MORNING',
  PEAK_EVENING: 'PEAK_EVENING',
  OFF_PEAK: 'OFF_PEAK',
});

const trafficSnapshotSchema = new mongoose.Schema(
  {
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: [true, 'routeId reference is required'],
      index: true,
    },
    timeSlot: {
      type: String,
      enum: Object.values(TIME_SLOTS),
      required: [true, 'timeSlot is required'],
    },
    multiplier: {
      type: Number,
      required: [true, 'multiplier is required'],
      min: [0.1, 'Traffic multiplier must be at least 0.1'],
    },
  },
  {
    timestamps: true,
  }
);

trafficSnapshotSchema.index({ routeId: 1, timeSlot: 1 }, { unique: true });

const TrafficSnapshot =
  mongoose.models.TrafficSnapshot ||
  mongoose.model('TrafficSnapshot', trafficSnapshotSchema);

export default TrafficSnapshot;
