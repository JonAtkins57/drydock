/**
 * BambooHR API Client
 *
 * Wraps HTTP calls to the BambooHR v1 API.
 * All responses are typed; errors are thrown as BambooHRApiError.
 */

export interface BambooEmployee {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  department: string;
  jobTitle: string;
  supervisorId: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  status: string;
  employeeNumber: string;
}

export interface BambooDepartment {
  id: string;
  name: string;
  parentId: string | null;
}

export class BambooHRApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'BambooHRApiError';
  }
}

const BASE_URL = 'https://api.bamboohr.com/api/gateway.php';

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`).toString('base64')}`;
}

async function bambooFetch<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader(apiKey),
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BambooHRApiError(res.status, `BambooHR API error ${res.status}: ${res.statusText}`, body);
  }

  return res.json() as Promise<T>;
}

/**
 * GET /api/gateway.php/{subdomain}/v1/employees/directory
 * Returns the employee directory.
 */
export async function getEmployees(subdomain: string, apiKey: string): Promise<BambooEmployee[]> {
  interface DirectoryResponse {
    employees: Array<{
      id: string;
      displayName?: string;
      firstName?: string;
      lastName?: string;
      workEmail?: string;
      department?: string;
      jobTitle?: string;
      supervisorId?: string;
      hireDate?: string;
      terminationDate?: string;
      status?: string;
      employeeNumber?: string;
    }>;
  }

  const data = await bambooFetch<DirectoryResponse>(
    `${BASE_URL}/${encodeURIComponent(subdomain)}/v1/employees/directory`,
    apiKey,
  );

  return (data.employees ?? []).map((e) => ({
    id: String(e.id),
    displayName: e.displayName ?? '',
    firstName: e.firstName ?? '',
    lastName: e.lastName ?? '',
    workEmail: e.workEmail ?? '',
    department: e.department ?? '',
    jobTitle: e.jobTitle ?? '',
    supervisorId: e.supervisorId ? String(e.supervisorId) : null,
    hireDate: e.hireDate ?? null,
    terminationDate: e.terminationDate ?? null,
    status: e.status ?? 'active',
    employeeNumber: e.employeeNumber ?? '',
  }));
}

/**
 * GET /api/gateway.php/{subdomain}/v1/employees/{id}
 * Returns a single employee record.
 */
export async function getEmployee(subdomain: string, apiKey: string, id: string): Promise<BambooEmployee> {
  interface EmployeeResponse {
    id: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    workEmail?: string;
    department?: string;
    jobTitle?: string;
    supervisorId?: string;
    hireDate?: string;
    terminationDate?: string;
    status?: string;
    employeeNumber?: string;
  }

  const e = await bambooFetch<EmployeeResponse>(
    `${BASE_URL}/${encodeURIComponent(subdomain)}/v1/employees/${encodeURIComponent(id)}?fields=firstName,lastName,workEmail,department,jobTitle,supervisorId,hireDate,terminationDate,status,employeeNumber,displayName`,
    apiKey,
  );

  return {
    id: String(e.id),
    displayName: e.displayName ?? '',
    firstName: e.firstName ?? '',
    lastName: e.lastName ?? '',
    workEmail: e.workEmail ?? '',
    department: e.department ?? '',
    jobTitle: e.jobTitle ?? '',
    supervisorId: e.supervisorId ? String(e.supervisorId) : null,
    hireDate: e.hireDate ?? null,
    terminationDate: e.terminationDate ?? null,
    status: e.status ?? 'active',
    employeeNumber: e.employeeNumber ?? '',
  };
}

/**
 * GET /api/gateway.php/{subdomain}/v1/meta/lists
 * Extracts department list from BambooHR metadata.
 * BambooHR doesn't have a standalone departments endpoint —
 * we derive departments from employee directory data.
 */
export async function getDepartments(subdomain: string, apiKey: string): Promise<BambooDepartment[]> {
  const employees = await getEmployees(subdomain, apiKey);

  // Dedupe departments from employee data
  const deptMap = new Map<string, BambooDepartment>();
  for (const emp of employees) {
    if (emp.department && !deptMap.has(emp.department)) {
      deptMap.set(emp.department, {
        id: emp.department, // BambooHR doesn't expose dept IDs; use name as key
        name: emp.department,
        parentId: null,
      });
    }
  }

  return Array.from(deptMap.values());
}
