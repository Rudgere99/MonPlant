import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const nav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/producao-planta", label: "Produção da Planta" },
  { to: "/horimetros", label: "Horímetros" },
  { to: "/paradas", label: "Paradas" },
  { to: "/exportar", label: "Exportar Excel" },
];

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white">
      <div className="flex min-h-screen">
        {/* sidebar */}
        <aside className="w-64 border-r border-white/10 bg-white/5 p-4">
          <Link to="/dashboard" className="block text-lg font-extrabold">
            MONPLANT
          </Link>
          <div className="mt-1 text-xs text-white/60">Controle de Produção</div>

          <nav className="mt-6 flex flex-col gap-1">
            {nav.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  [
                    "rounded-lg px-3 py-2 text-sm font-semibold",
                    isActive ? "bg-white/10" : "hover:bg-white/5",
                  ].join(" ")
                }
              >
                {i.label}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="mt-6 w-full rounded-lg bg-red-500/80 px-3 py-2 text-sm font-bold text-black hover:bg-red-400"
          >
            Sair
          </button>
        </aside>

        {/* content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
