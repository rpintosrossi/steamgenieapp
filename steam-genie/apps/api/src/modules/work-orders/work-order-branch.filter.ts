/** Work orders de una sucursal: presupuesto emisor o edificio de esa sucursal. */
export function workOrderBranchWhere(branchId: string) {
  return {
    OR: [{ quote: { branchId } }, { building: { branchId } }],
  };
}

export function workOrderBranchesWhere(branchIds: string[]) {
  if (branchIds.length === 1) return workOrderBranchWhere(branchIds[0]!);
  return {
    OR: [
      { quote: { branchId: { in: branchIds } } },
      { building: { branchId: { in: branchIds } } },
    ],
  };
}
