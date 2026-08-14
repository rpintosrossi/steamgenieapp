/** Work orders de una sucursal: presupuesto emisor o cliente particular de esa sucursal. */
export function workOrderBranchWhere(branchId: string) {
  return {
    OR: [
      { quote: { branchId } },
      { building: { particularClient: { branchId, deletedAt: null } } },
    ],
  };
}
