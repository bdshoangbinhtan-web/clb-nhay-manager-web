import type { Metadata } from "next";
import PublicHome from "@/components/public/public-home";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() { return <PublicHome />; }
