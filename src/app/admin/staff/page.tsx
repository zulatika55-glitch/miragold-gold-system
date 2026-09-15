"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type StaffUser = {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  role: "CUSTOMER" | "STAFF" | "SUPERVISOR" | "ADMIN" | "OWNER";
  status: "ACTIVE" | "SUSPENDED" | "REVIEW" | "CLOSED";
  tags: string[];
  createdAt: string;
};

const ROLES = ["CUSTOMER", "STAFF", "SUPERVISOR", "ADMIN"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED", "REVIEW", "CLOSED"] as const;

export default function AdminStaffPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", phone: "", email: "", role: "STAFF" as (typeof ROLES)[number] });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setUsers([]);
        return;
      }
      if (!res.ok) throw new Error("Gagal memuatkan senarai");
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace("/login?next=/admin/staff");
        } else if (!["ADMIN", "OWNER"].includes(d.user.role)) {
          router.replace("/wallet");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me || !["ADMIN", "OWNER"].includes(me.role)) return;
    let cancelled = false;

    async function run() {
      const res = await fetch("/api/admin/staff");
      if (cancelled) return;
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Gagal memuatkan senarai");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setUsers(data.users);
      setLoading(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      }
      setForm({ name: "", phone: "", email: "", role: "STAFF" });
      await load(q);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }

  async function updateUser(id: string, patch: Partial<Pick<StaffUser, "role" | "status">>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  if (me === undefined) return null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900">Urus Staff / Pilot</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Tambah akaun staff (login guna phone + OTP sama macam customer), atau tag akaun sedia ada sebagai STAFF.
      </p>

      <form onSubmit={addStaff} className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-amber-900/10 bg-white p-6 sm:grid-cols-2">
        <h2 className="col-span-full text-lg font-medium text-zinc-900">Tambah Staff Baharu</h2>
        <label className="text-sm font-medium text-zinc-700">
          Nama
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Nombor telefon
          <input
            required
            placeholder="+60123456789"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Emel (untuk terima kod OTP)
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Peranan
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as (typeof ROLES)[number] }))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          >
            <option value="STAFF">STAFF</option>
            <option value="SUPERVISOR">SUPERVISOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        {formError && <p className="col-span-full text-sm text-red-600">{formError}</p>}
        <button
          disabled={formBusy}
          className="col-span-full mt-2 rounded-full bg-amber-900 px-4 py-2 font-medium text-white disabled:opacity-50 sm:w-fit"
        >
          {formBusy ? "Menambah..." : "Tambah Staff"}
        </button>
      </form>

      <div className="mt-8 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
          placeholder="Cari nama / phone / customer ID / emel..."
          className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button onClick={() => load(q)} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700">
          Cari
        </button>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-zinc-400">Memuatkan...</p>}

      {!loading && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Customer ID</th>
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Emel</th>
                <th className="px-3 py-2">Peranan</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                    Tiada akaun dijumpai.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-500">{u.customerId}</td>
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2">{u.phone}</td>
                  <td className="px-3 py-2 text-zinc-500">{u.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    {u.role === "OWNER" ? (
                      <span className="font-medium text-amber-900">OWNER</span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={savingId === u.id}
                        onChange={(e) => updateUser(u.id, { role: e.target.value as StaffUser["role"] })}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {u.role === "OWNER" ? (
                      <span className="text-zinc-500">{u.status}</span>
                    ) : (
                      <select
                        value={u.status}
                        disabled={savingId === u.id}
                        onChange={(e) => updateUser(u.id, { status: e.target.value as StaffUser["status"] })}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
