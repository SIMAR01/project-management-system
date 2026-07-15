import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI as string);

    console.log(
      `MongoDB Connected: ${connection.connection.host}`
    );
  } catch (error) {
    console.error("Failed to connect to MongoDB");

    if (error instanceof Error) {
      console.error(error.message);
    }

    process.exit(1);
  }
};