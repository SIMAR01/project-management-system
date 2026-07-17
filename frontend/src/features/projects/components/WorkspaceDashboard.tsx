import React, { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  useWorkspacesQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useInviteMemberMutation,
  useRemoveMemberMutation,
  useProjectActivityQuery,
} from "../hooks/useProjectQueries";
import { useProjectSocketSync } from "../hooks/useProjectSocketSync";
import { ProjectWorkspace, ProjectActivityEvent } from "../types/project.types";
import {
  FolderKanban,
  Activity,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  Users,
  X,
  Search,
  Clock,
  Shield,
  Loader2,
  ArrowRight,
  UserMinus,
  AlertCircle,
  History,
  KanbanSquare
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export const WorkspaceDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Activate the real-time Socket.IO cache synchronization hook
  useProjectSocketSync();

  const { data: workspaces = [], isLoading, error } = useWorkspacesQuery();

  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<ProjectWorkspace | null>(null);
  const [activeActivityProjectId, setActiveActivityProjectId] = useState<string | null>(null);

  // Modal open states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ProjectManager" | "TeamMember">("TeamMember");
  const [actionError, setActionError] = useState<string | null>(null);

  // Mutations
  const createMutation = useCreateWorkspaceMutation(() => {
    setIsCreateOpen(false);
    resetForm();
  });
  const updateMutation = useUpdateWorkspaceMutation(() => {
    setIsEditOpen(false);
    resetForm();
  });
  const deleteMutation = useDeleteWorkspaceMutation();
  const inviteMutation = useInviteMemberMutation(() => {
    setInviteEmail("");
    setActionError(null);
  });
  const removeMutation = useRemoveMemberMutation();

  const resetForm = () => {
    setName("");
    setDescription("");
    setInviteEmail("");
    setInviteRole("TeamMember");
    setActionError(null);
  };

  // Helper to verify if the current user has ProjectManager privileges on a project
  const isProjectManager = (project: ProjectWorkspace) => {
    if (!user) return false;
    const isOwner = project.owner === user.id || project.ownerId === user.id;
    const membership = project.members?.find((m) => m.userId === user.id);
    return isOwner || membership?.role === "ProjectManager";
  };

  // Global RBAC restriction to hide/shield "Create Project" button
  const canCreateGlobal = user?.role === "ProjectManager" || user?.role === undefined;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (name.trim().length < 3) {
      setActionError("Workspace name must be at least 3 characters");
      return;
    }
    createMutation.mutate(
      { name, description },
      {
        onError: (err: any) => {
          setActionError(err.response?.data?.message || "Failed to create project");
        },
      }
    );
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!selectedProject) return;
    if (name.trim().length < 3) {
      setActionError("Workspace name must be at least 3 characters");
      return;
    }
    updateMutation.mutate(
      { projectId: selectedProject.projectId, name, description },
      {
        onError: (err: any) => {
          setActionError(err.response?.data?.message || "Failed to update project");
        },
      }
    );
  };

  const handleDelete = (projectId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this project workspace?")) {
      deleteMutation.mutate(projectId);
    }
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!selectedProject) return;
    if (!inviteEmail.trim()) {
      setActionError("Please enter a username or email");
      return;
    }
    inviteMutation.mutate(
      {
        projectId: selectedProject.projectId,
        emailOrUsername: inviteEmail,
        role: inviteRole,
      },
      {
        onError: (err: any) => {
          setActionError(err.response?.data?.message || "User not found or already added");
        },
      }
    );
  };

  const handleRemoveMember = (userId: string) => {
    if (!selectedProject) return;
    if (window.confirm("Remove this member from the project?")) {
      removeMutation.mutate(
        { projectId: selectedProject.projectId, userId },
        {
          onSuccess: (data) => {
            // Update selected project members state to keep modal sync'd
            setSelectedProject((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                members: prev.members.filter((m) => m.userId !== userId),
              };
            });
          },
        }
      );
    }
  };

  // Filter workspaces based on search query
  const filteredWorkspaces = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.description && w.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeWorkspaces = filteredWorkspaces.filter((w) => w.isDeleted !== true);
  const archivedWorkspaces = filteredWorkspaces.filter((w) => w.isDeleted === true);
  const displayedWorkspaces = activeTab === "active" ? activeWorkspaces : archivedWorkspaces;

  return (
    <div className="space-y-6 relative min-h-screen pb-16">
      {/* Workspace Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-brand-500" />
            <span>Workspaces</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Access, build, and coordinate active project workspaces in real-time.
          </p>
        </div>

        {/* Global shielded creation button */}
        {canCreateGlobal && (
          <button
            onClick={() => {
              resetForm();
              setIsCreateOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-tr from-brand-600 to-violet-500 hover:from-brand-500 hover:to-violet-400 active:scale-98 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all shadow-md shadow-brand-500/10 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Project</span>
          </button>
        )}
      </div>

      {/* Filter and search bar */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          placeholder="Filter workspaces by name or keywords..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-900/40 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-brand-500 transition-colors placeholder-slate-500 text-slate-200"
        />
      </div>

      {/* Tab Selector */}
      <div className="flex border-b border-slate-800/80 shrink-0">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === "active"
            ? "border-brand-500 text-brand-400 bg-brand-500/5"
            : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
        >
          Active Projects ({activeWorkspaces.length})
        </button>
        <button
          onClick={() => setActiveTab("archived")}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === "archived"
            ? "border-red-500 text-red-400 bg-red-500/5"
            : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
        >
          Archived Projects ({archivedWorkspaces.length})
        </button>
      </div>

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card rounded-2xl p-5 space-y-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-5 w-1/2 bg-slate-800 rounded"></div>
                <div className="h-4 w-12 bg-slate-800 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full bg-slate-800 rounded"></div>
                <div className="h-3 w-2/3 bg-slate-800 rounded"></div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-900">
                <div className="h-3 w-24 bg-slate-800 rounded"></div>
                <div className="h-4 w-16 bg-slate-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 rounded-2xl border border-red-500/30 bg-red-500/5 text-center text-red-200">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <h3 className="font-semibold">Failed to load workspaces</h3>
          <p className="text-xs text-red-300/80 mt-1">
            An error occurred while fetching your projects: {error.message || "Unknown error"}
          </p>
        </div>
      ) : displayedWorkspaces.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center border-dashed border-slate-800">
          <FolderKanban className="w-10 h-10 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-200">
            {activeTab === "active" ? "No active workspaces found" : "No archived workspaces found"}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
            {searchQuery
              ? "No workspaces match your query filter. Try refining your keywords."
              : activeTab === "active"
                ? "You do not have any active project workspaces currently."
                : "No deleted/archived project workspaces available."}
          </p>
        </div>
      ) : (
        /* Workspaces Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedWorkspaces.map((project) => {
            const isManager = isProjectManager(project);
            const isProjectDeleted = project.isDeleted === true;

            return (
              <div
                key={project.projectId}
                className={`glass-card rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between group ${isProjectDeleted
                  ? "border-red-500/20 bg-red-950/5 opacity-80"
                  : "hover:border-slate-700/85"
                  }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold transition-colors ${isProjectDeleted ? "text-slate-400" : "text-slate-100 group-hover:text-brand-400"
                      }`}>
                      {project.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isProjectDeleted && (
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                          Archived
                        </span>
                      )}
                      {project.owner === user?.id && (
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded border border-brand-500/20">
                          Owner
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {project.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-5 border-t border-slate-900/80 pt-3.5 flex items-center justify-between gap-2 text-xs">
                  {/* Left: Metadata info */}
                  <div className="flex items-center gap-3 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{project.members?.length || 1}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    {!isProjectDeleted ? (
                      <>
                        {/* View Task Board: Accessible to all members */}
                        <button
                          onClick={() => navigate(`/dashboard/projects/${project.projectId}/tasks`)}
                          title="Open Task Board"
                          className="p-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 hover:text-brand-300 border border-brand-500/20 transition-colors"
                        >
                          <KanbanSquare className="w-4 h-4" />
                        </button>

                        {/* Activity Log: Accessible to all members */}
                        <button
                          onClick={() => setActiveActivityProjectId(project.projectId)}
                          title="View Activity Feed"
                          className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>

                        {/* Role-Shielded Admin Tools */}
                        {isManager && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedProject(project);
                                resetForm();
                                setInviteEmail("");
                                setIsMembersOpen(true);
                              }}
                              title="Invite & Manage Members"
                              className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-brand-400 hover:text-brand-300 border border-slate-800 transition-colors"
                            >
                              <UserPlus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedProject(project);
                                setName(project.name);
                                setDescription(project.description || "");
                                setIsEditOpen(true);
                              }}
                              title="Edit Workspace"
                              className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(project.projectId)}
                              title="Delete Workspace"
                              className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/20 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Archived Project actions: only Activity Log is accessible */}
                        <button
                          onClick={() => setActiveActivityProjectId(project.projectId)}
                          title="View Activity Feed"
                          className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] text-red-400 font-semibold px-2 py-1 bg-red-950/20 border border-red-900/30 rounded-lg select-none">
                          Read Only
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Activity Timeline Slide-out Panel */}
      <ActivityFeedPanel
        projectId={activeActivityProjectId}
        onClose={() => setActiveActivityProjectId(null)}
      />

      {/* CREATE WORKSPACE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80">
            <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="font-bold text-slate-100">Create New Workspace</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {actionError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apollo Launchpad"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Describe the scope, objectives, or members of the project..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 active:scale-98 text-white rounded-lg transition-all flex items-center gap-1.5"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Create Workspace</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT WORKSPACE MODAL */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80">
            <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="font-bold text-slate-100">Edit Workspace Details</h3>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {actionError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apollo Launchpad"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Workspace description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 active:scale-98 text-white rounded-lg transition-all flex items-center gap-1.5"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE MEMBERS MODAL */}
      {isMembersOpen && selectedProject && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-400" />
                  <span>Workspace Members</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Managing members for project: <span className="text-brand-300 font-semibold">{selectedProject.name}</span>
                </p>
              </div>
              <button onClick={() => setIsMembersOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Invite Form */}
            <form onSubmit={handleInviteSubmit} className="p-6 border-b border-slate-900 space-y-4 shrink-0 bg-slate-900/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Add Member</h4>
              {actionError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    placeholder="Enter email address or username..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="TeamMember">TeamMember</option>
                    {/* <option value="ProjectManager">ProjectManager</option> */}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-500 active:scale-98 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-all shrink-0"
                >
                  {inviteMutation.isPending && <Loader2 className="w-4.5 h-4.5 animate-spin" />}
                  <span>Invite</span>
                </button>
              </div>
            </form>

            {/* Members List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Active Members</h4>
              <div className="space-y-2">
                {/* Render Owner first */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-brand-500/5 border border-brand-500/20">
                  <div>
                    <span className="text-sm font-medium text-slate-100 flex items-center gap-1.5 flex-wrap">
                      <span>{selectedProject.ownerName || "Workspace Owner"}</span>
                      <span className="text-xs text-slate-400 font-normal">(@{selectedProject.ownerUsername || "owner"})</span>
                    </span>
                    <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block sm:mt-0 sm:ml-2.5">
                      Workspace Owner
                    </span>
                  </div>
                </div>

                {/* Render other members */}
                {selectedProject.members
                  ?.filter((m) => m.userId !== selectedProject.owner)
                  .map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-850 hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm font-medium text-slate-200 truncate max-w-sm flex items-center gap-1.5">
                          <span>{member.name || "Unknown"}</span>
                          <span className="text-xs text-slate-500 font-normal">(@{member.username || "unknown"})</span>
                        </div>
                        <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-semibold border border-slate-700">
                          {member.role}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={removeMutation.isPending}
                        title="Remove member"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                {selectedProject.members?.filter((m) => m.userId !== selectedProject.owner).length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-500">
                    No members invited to this workspace yet.
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 bg-slate-950 border-t border-slate-900/80 flex justify-end shrink-0">
              <button
                onClick={() => setIsMembersOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg transition-colors border border-slate-750"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Slide-out Panel displaying the audit events.
 */
interface ActivityFeedPanelProps {
  projectId: string | null;
  onClose: () => void;
}

const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({ projectId, onClose }) => {
  const { data: events = [], isLoading, error } = useProjectActivityQuery(
    projectId || "",
    !!projectId
  );

  const getEventDescription = (event: ProjectActivityEvent) => {
    const actor = event.performedBy;
    switch (event.eventType) {
      case "PROJECT_CREATED":
        return `${actor} created this workspace`;
      case "PROJECT_UPDATED":
        const updatedFields = event.payload?.updated || {};
        return `${actor} updated workspace fields: ${Object.keys(updatedFields).join(", ")}`;
      case "PROJECT_ARCHIVED":
        return `${actor} archived this workspace`;
      case "PROJECT_DELETED":
        return `${actor} deleted this workspace`;
      case "MEMBER_INVITED":
        const invitee = event.payload?.username || event.payload?.inviteeId || "member";
        return `${actor} invited ${invitee} as a ${event.payload?.role || "member"}`;
      case "MEMBER_REMOVED":
        return `${actor} removed member (ID: ${event.payload?.targetUserId})`;
      case "TASK_CREATED":
        return `${actor} created task "${event.payload?.title || "Untitled"}"`;
      case "STATUS_CHANGED":
        return `${actor} moved task "${event.payload?.title || "Task"}" to "${event.payload?.newStatus}"`;
      case "TASK_DELETED":
        return `${actor} deleted task "${event.payload?.title || "Untitled"}"`;
      case "ASSIGNEE_CHANGED":
        return `${actor} updated assignee for task "${event.payload?.title || "Task"}"`;
      case "TASK_UPDATED":
        return `${actor} updated task ${event.payload?.field || "field"} of "${event.payload?.title || "Task"}"`;
      default:
        return `${actor} performed action: ${event.eventType}`;
    }
  };

  const getEventIconColor = (eventType: string) => {
    switch (eventType) {
      case "PROJECT_CREATED":
      case "TASK_CREATED":
        return "bg-green-500/10 text-green-400 border border-green-500/20";
      case "PROJECT_UPDATED":
      case "TASK_UPDATED":
        return "bg-brand-500/10 text-brand-400 border border-brand-500/20";
      case "MEMBER_INVITED":
      case "ASSIGNEE_CHANGED":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
      case "MEMBER_REMOVED":
      case "TASK_DELETED":
        return "bg-red-500/10 text-red-400 border border-red-500/20";
      case "STATUS_CHANGED":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      default:
        return "bg-slate-800 text-slate-400 border border-slate-700";
    }
  };

  return (
    <>
      {/* Background Overlay */}
      {projectId && (
        <div onClick={onClose} className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 transition-opacity duration-300" />
      )}

      {/* Slideout Feed Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-800/80 shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${projectId ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-400" />
              <span>Workspace Activity Feed</span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">
              Chronological Audit Trail
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content timeline */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-slate-800"></div>
                  <div className="flex-1 space-y-2 mt-1">
                    <div className="h-3 w-3/4 bg-slate-800 rounded"></div>
                    <div className="h-2 w-1/4 bg-slate-800 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-xs text-red-400">
              Failed to fetch event feed details.
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs flex flex-col items-center justify-center">
              <Activity className="w-8 h-8 text-slate-700 mb-2.5" />
              <span>No activity logged in this workspace yet.</span>
            </div>
          ) : (
            <div className="relative border-l border-slate-800/85 pl-4 ml-3.5 space-y-6 py-2">
              {events.map((event) => (
                <div key={event.id} className="relative group">
                  {/* Event timeline dot marker */}
                  <span
                    className={`absolute -left-[30px] top-0.5 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${getEventIconColor(
                      event.eventType
                    )}`}
                  >
                    {event.eventType.charAt(0)}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-slate-200 leading-relaxed">
                      {getEventDescription(event)}
                    </p>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {new Date(event.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
