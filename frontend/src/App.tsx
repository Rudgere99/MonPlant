// src/App.tsx
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <>
      <AppRoutes />
      <SpeedInsights />
    </>
  );
}
