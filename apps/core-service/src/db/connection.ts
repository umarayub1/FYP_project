import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(process.env.MONGO_URI!, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    setTimeout(connectDB, 5000);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — retrying in 5s');
  setTimeout(connectDB, 5000);
});
