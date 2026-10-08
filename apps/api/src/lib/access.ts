// Kontrol akses project: setiap project hanya dapat diakses pemiliknya (Project.userId).
// Semua query project WAJIB memakai projectWhere (jangan menulis { id, userId } sendiri).

/** Filter Prisma untuk project milik user, opsional untuk satu project tertentu. */
export function projectWhere(userId: string, projectId?: string) {
  return {
    ...(projectId ? { id: projectId } : {}),
    userId,
  };
}
