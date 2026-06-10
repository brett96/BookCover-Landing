import AdminDashboard from "@/components/AdminDashboard";

export const metadata = {
  title: "Admin — BookCover",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
