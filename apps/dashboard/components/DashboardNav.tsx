"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardNav() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname?.startsWith(path);

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">penny Dashboard</h1>
          <div className="text-sm text-gray-600">Portfolio Constraint System</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {/* Main Navigation */}
          <Link
            href="/portfolio"
            className={`px-4 py-2 rounded transition ${
              isActive("/portfolio")
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📊 Portfolio
          </Link>

          <Link
            href="/constraints"
            className={`px-4 py-2 rounded transition ${
              isActive("/constraints")
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📋 Constraints
          </Link>

          <Link
            href="/violations"
            className={`px-4 py-2 rounded transition ${
              isActive("/violations")
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            ⚠️ Violations
          </Link>

          {/* Admin Section */}
          <div className="relative group">
            <button className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-left">
              ⚙️ Admin
            </button>
            <div className="absolute hidden group-hover:block w-full bg-white border border-gray-200 rounded mt-1 shadow-lg z-10">
              <Link
                href="/admin/settings"
                className="block px-4 py-2 text-gray-700 hover:bg-blue-50"
              >
                Settings
              </Link>
              <Link
                href="/admin/extract"
                className="block px-4 py-2 text-gray-700 hover:bg-blue-50 border-t"
              >
                Extract Constraints
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="px-6 py-2 bg-gray-50 text-xs text-gray-600">
        {pathname && (
          <>
            <Link href="/" className="text-blue-600 hover:underline">
              Home
            </Link>
            {pathname.split("/").filter(Boolean).map((segment, i, arr) => (
              <span key={i}>
                {" "}
                / <span className="capitalize">{segment}</span>
              </span>
            ))}
          </>
        )}
      </div>
    </nav>
  );
}
