// CMS → Staff users and Roles & permissions. The server enforces every rule (no escalation, last Super
// Admin, audit); the UI only hides what the signed-in admin cannot do.
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import { Panel, Pill } from '@/components/portal/PortalShell';
import { Loading } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { cx, fmtDate, fmtTime } from '@/lib/utils';

const useCan = () => { const { user } = useStore(); return (p) => !!user?.superAdmin || !!user?.permissions?.includes(p); };

/** One-time set-password link, shown once after invite / reset. */
function LinkBox({ link, email, onClose }) {
  const { toast } = useStore();
  const copy = async () => { try { await navigator.clipboard.writeText(link.setupUrl); toast('Link copied'); } catch { toast('Copy failed — select the link and copy it', 'err'); } };
  return (
    <div className="space-y-4 text-sm">
      <p className="text-ink-700">Send this link to <b>{email}</b> over a private channel (work chat, email). They choose their own password, then set up an authenticator app on first sign-in.</p>
      <div className="flex gap-2"><input readOnly className="input font-mono text-xs" value={link.setupUrl} onFocus={(e) => e.target.select()} aria-label="Set-password link" /><button type="button" onClick={copy} className="btn-primary h-11 shrink-0 px-4"><Icon name="Copy" size={15} />Copy</button></div>
      <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-800"><Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />Shown only now — Ticketo stores just a fingerprint of it. It works once and expires {fmtDate(link.expiresAt)} {fmtTime(link.expiresAt)}. Lost it? Use “Reset access” for a new one.</p>
      <button type="button" onClick={onClose} className="btn-outline h-10 w-full">Done</button>
    </div>
  );
}

function RolePicker({ roles, value, onChange, canGrant }) {
  return (
    <div className="space-y-2">
      {roles.map((r) => {
        const on = value.includes(r.id);
        return (
          <label key={r.id} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm', on ? 'border-brand-500 bg-brand-50' : 'border-ink-100 hover:border-ink-300', !canGrant(r) && !on && 'cursor-not-allowed opacity-50')}>
            <input type="checkbox" className="mt-0.5 accent-brand-500" checked={on} disabled={!canGrant(r) && !on} onChange={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])} />
            <span><span className="font-medium">{r.name}</span>{r.system && <span className="badge ml-2 bg-ink-100 text-ink-700">system</span>}<span className="block text-xs text-ink-500">{r.description || `${r.permissions} permissions`}</span></span>
          </label>
        );
      })}
    </div>
  );
}

export function StaffUsers() {
  const { user: me, toast } = useStore();
  const can = useCan();
  const users = useApi(() => api.staffUsers(), []);
  const roles = useApi(() => api.staffRoles(), []);
  const [edit, setEdit] = useState(null); // { mode: 'invite' | 'edit', form, user? }
  const [link, setLink] = useState(null); // { setupUrl, expiresAt, email }
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  if (users.loading || roles.loading) return <Loading />;
  const manage = can('users.manage');
  // Super Admin can grant anything; others only roles they fully hold (the server re-checks).
  const canGrant = (r) => me?.superAdmin || r.slug !== 'super-admin';
  const list = (users.data || []).filter((u) => !q || `${u.name} ${u.email} ${u.roles.map((r) => r.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    setBusy(true);
    try {
      const f = edit.form;
      if (edit.mode === 'invite') {
        const r = await api.inviteStaff({ name: f.name, email: f.email, roleIds: f.roleIds });
        setEdit(null); setLink({ setupUrl: r.setupUrl, expiresAt: r.expiresAt, email: f.email }); toast('User invited');
      } else {
        await api.updateStaff({ id: edit.user.id, name: f.name, status: f.status, roleIds: f.roleIds });
        setEdit(null); toast('User updated');
      }
      users.reload(); roles.reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const reset = async (u, resetMfa) => {
    if (!window.confirm(`Reset access for ${u.email}? Their current password stops working${resetMfa ? ' and they must set up their authenticator again' : ''}, and they are signed out everywhere.`)) return;
    try { const r = await api.resetStaffAccess({ id: u.id, resetMfa }); setEdit(null); setLink({ ...r, email: u.email }); users.reload(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <Panel title={`Staff users (${users.data.length})`} action={manage && <button onClick={() => setEdit({ mode: 'invite', form: { name: '', email: '', roleIds: [] } })} className="btn-primary h-9 px-4 text-sm"><Icon name="UserPlus" size={15} />Invite user</button>}>
        <div className="border-b border-ink-100 p-4"><input className="input h-10 max-w-sm text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or role" aria-label="Search users" /></div>
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">User</th><th className="th">Roles</th><th className="th">Security</th><th className="th">Last sign-in</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-ink-100">{list.map((u) => (
            <tr key={u.id}>
              <td className="td font-medium">{u.name}{u.email === me?.email && <span className="badge ml-2 bg-ink-100 text-ink-700">you</span>}<div className="text-xs text-ink-500">{u.email}</div></td>
              <td className="td"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <span key={r.id} className="badge bg-brand-50 text-brand-700">{r.name}</span>)}</div></td>
              <td className="td text-xs">{u.invited ? <span className="text-amber-700">Invite pending</span> : u.mfa ? <span className="flex items-center gap-1 text-emerald-700"><Icon name="ShieldCheck" size={14} />Authenticator on</span> : <span className="text-amber-700">Authenticator not set up</span>}</td>
              <td className="td whitespace-nowrap text-sm text-ink-500">{u.lastLoginAt ? `${fmtDate(u.lastLoginAt)} ${fmtTime(u.lastLoginAt)}` : '—'}</td>
              <td className="td"><Pill status={u.status} /></td>
              <td className="td">{manage && <button onClick={() => setEdit({ mode: 'edit', user: u, form: { name: u.name, status: u.status, roleIds: u.roles.map((r) => r.id) } })} className="text-sm font-medium text-brand-500">Manage</button>}</td>
            </tr>
          ))}</tbody></table></div>
        {!list.length && <p className="p-6 text-sm text-ink-500">No users match.</p>}
      </Panel>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.mode === 'invite' ? 'Invite a staff user' : `Manage ${edit?.user?.name || ''}`} wide>
        {edit && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <div><label className="label" htmlFor="su-name">Full name</label><input id="su-name" className="input" value={edit.form.name} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, name: e.target.value } })} /></div>
              {edit.mode === 'invite'
                ? <div><label className="label" htmlFor="su-email">Work email</label><input id="su-email" type="email" className="input" value={edit.form.email} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, email: e.target.value } })} autoComplete="off" /></div>
                : <div><span className="label">Email</span><p className="text-sm text-ink-700">{edit.user.email}</p></div>}
              {edit.mode === 'edit' && edit.user.email !== me?.email && (
                <div><label className="label" htmlFor="su-status">Status</label>
                  <select id="su-status" className="input" value={edit.form.status} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, status: e.target.value } })}><option value="active">Active</option><option value="suspended">Suspended (cannot sign in)</option></select></div>
              )}
              {edit.mode === 'edit' && edit.user.email !== me?.email && (
                <div className="rounded-xl border border-ink-100 p-3 text-sm">
                  <div className="font-medium">Reset access</div><p className="mt-1 text-xs text-ink-500">Creates a new set-password link and signs the user out everywhere.</p>
                  <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => reset(edit.user, false)} className="btn-outline h-9 px-3 text-sm">New password link</button><button type="button" onClick={() => reset(edit.user, true)} className="btn-outline h-9 px-3 text-sm">Link + reset authenticator</button></div>
                </div>
              )}
            </div>
            <div>
              <span className="label">Roles</span>
              {edit.mode === 'edit' && edit.user.email === me?.email && !me?.superAdmin ? <p className="text-sm text-ink-500">You can’t change your own roles.</p>
                : <RolePicker roles={roles.data} value={edit.form.roleIds} canGrant={canGrant} onChange={(roleIds) => setEdit({ ...edit, form: { ...edit.form, roleIds } })} />}
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <button type="button" onClick={() => setEdit(null)} className="btn-outline h-10 px-5">Cancel</button>
              <button type="button" onClick={save} disabled={busy || !edit.form.roleIds.length} className="btn-primary h-10 px-5">{edit.mode === 'invite' ? 'Invite & create link' : 'Save changes'}</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!link} onClose={() => setLink(null)} title="Set-password link">{link && <LinkBox link={link} email={link.email} onClose={() => setLink(null)} />}</Modal>
    </>
  );
}

export function RolesPermissions() {
  const { toast } = useStore();
  const roles = useApi(() => api.staffRoles(), []);
  const catalogue = useApi(() => api.permissionCatalogue(), []);
  const [sel, setSel] = useState(null); // role id | 'new'
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => { if (!sel && roles.data?.length) setSel(roles.data[0].id); }, [roles.data]); // eslint-disable-line
  useEffect(() => {
    if (!sel) return;
    if (sel === 'new') { setForm({ name: '', description: '', permissions: [], system: false, locked: false }); return; }
    let live = true;
    api.staffRole({ id: sel }).then((r) => live && setForm(r)).catch((e) => toast(e.message, 'err'));
    return () => { live = false; };
  }, [sel]); // eslint-disable-line
  const groups = useMemo(() => (catalogue.data || []).map((g) => ({ ...g, permissions: g.permissions.filter((p) => !q || `${p.slug} ${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.permissions.length), [catalogue.data, q]);
  if (roles.loading || catalogue.loading) return <Loading />;

  const has = (slug) => form?.permissions.includes(slug);
  const toggle = (slugs, on) => setForm({ ...form, permissions: on ? [...new Set([...form.permissions, ...slugs])] : form.permissions.filter((p) => !slugs.includes(p)) });
  const save = async () => {
    setBusy(true);
    try { const r = await api.saveStaffRole({ id: sel === 'new' ? undefined : sel, name: form.name, description: form.description, permissions: form.permissions }); toast('Role saved'); await roles.reload(); setSel(r.id); setForm(r); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the role “${form.name}”?`)) return;
    try { await api.deleteStaffRole({ id: sel }); toast('Role deleted'); setSel(null); setForm(null); roles.reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const current = roles.data.find((r) => r.id === sel);

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title="Roles" action={<button onClick={() => setSel('new')} className="btn-ghost h-8 px-2 text-sm text-brand-500"><Icon name="Plus" size={15} />New</button>}>
        <ul className="divide-y divide-ink-100">{roles.data.map((r) => (
          <li key={r.id}><button onClick={() => setSel(r.id)} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left text-sm', sel === r.id ? 'bg-brand-50' : 'hover:bg-ink-50')}>
            <Icon name={r.slug === 'super-admin' ? 'Crown' : 'Shield'} size={16} className="shrink-0 text-ink-500" />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span><span className="text-xs text-ink-500">{r.permissions} permissions · {r.users} user{r.users === 1 ? '' : 's'}</span></span>
            {r.system && <span className="badge bg-ink-100 text-ink-700">system</span>}
          </button></li>
        ))}</ul>
      </Panel>

      {form ? (
        <Panel title={sel === 'new' ? 'New role' : form.name} action={form.locked ? <span className="badge bg-amber-50 text-amber-800">Full access · locked</span> : null}>
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="rl-name">Role name</label><input id="rl-name" className="input" disabled={form.locked} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Finance reviewer" /></div>
              <div><label className="label" htmlFor="rl-desc">Description</label><input id="rl-desc" className="input" disabled={form.locked} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this role is for" /></div>
            </div>
            {form.locked ? <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-700">Super Admin always has every permission, including ones added later. It can’t be edited or deleted, and at least one active Super Admin must remain.</p> : (<>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-ink-700"><b>{form.permissions.length}</b> permissions selected</span>
                <input className="input h-9 max-w-xs text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter permissions" aria-label="Filter permissions" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">{groups.map((g) => {
                const slugs = g.permissions.map((p) => p.slug); const all = slugs.every(has);
                return (
                  <fieldset key={g.name} className="rounded-xl border border-ink-100">
                    <legend className="sr-only">{g.name}</legend>
                    <label className="flex cursor-pointer items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-sm font-semibold capitalize"><span>{g.name}</span><input type="checkbox" className="accent-brand-500" checked={all} onChange={() => toggle(slugs, !all)} aria-label={`All ${g.name} permissions`} /></label>
                    <div className="divide-y divide-ink-100">{g.permissions.map((p) => (
                      <label key={p.slug} className="flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm hover:bg-ink-50/60">
                        <input type="checkbox" className="mt-0.5 accent-brand-500" checked={has(p.slug)} onChange={() => toggle([p.slug], !has(p.slug))} />
                        <span><span className="font-medium">{p.name}</span><span className="block text-xs text-ink-500">{p.description} · <code>{p.slug}</code></span></span>
                      </label>
                    ))}</div>
                  </fieldset>
                );
              })}</div>
              <div className="flex flex-wrap justify-between gap-2 border-t border-ink-100 pt-4">
                {sel !== 'new' && !form.system ? <button type="button" onClick={remove} disabled={current?.users > 0} title={current?.users ? 'Remove this role from all users first' : undefined} className="btn-outline h-10 px-4 text-sm"><Icon name="Trash2" size={15} />Delete role</button> : <span />}
                <button type="button" onClick={save} disabled={busy || form.name.trim().length < 3} className="btn-primary h-10 px-6"><Icon name="Save" size={15} />{sel === 'new' ? 'Create role' : 'Save role'}</button>
              </div>
              <p className="text-xs text-ink-500">You can only grant permissions you hold yourself. Users whose role loses a permission are signed out so the change applies immediately. Every change is recorded in the audit log.</p>
            </>)}
          </div>
        </Panel>
      ) : <Loading />}
    </div>
  );
}
