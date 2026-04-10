import { z } from 'zod';

// ── Shared ──────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

const addressSchema = z.object({
  line1: z.string().max(255).optional(),
  line2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
}).passthrough().nullable().optional();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  sort: z.string().optional(),
  filter: z.string().optional(),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ── Custom field value input ────────────────────────────────────────

const customFieldValueInput = z.object({
  fieldDefinitionId: z.string().uuid(),
  value: z.unknown(),
});

export const customFieldValuesSchema = z.array(customFieldValueInput).optional();

// ── Customers ───────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  entityId: uuidSchema.optional(),
  billingAddress: addressSchema,
  shippingAddress: addressSchema,
  paymentTermsId: uuidSchema.optional(),
  taxCodeId: uuidSchema.optional(),
  creditLimit: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  parentCustomerId: uuidSchema.optional(),
  externalId: z.string().max(255).optional(),
  customFields: customFieldValuesSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema
  .omit({ customFields: true })
  .partial()
  .extend({
    customFields: customFieldValuesSchema,
  });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ── Vendors ─────────────────────────────────────────────────────────

export const createVendorSchema = z.object({
  name: z.string().min(1).max(255),
  entityId: uuidSchema.optional(),
  remitToAddress: addressSchema,
  paymentTermsId: uuidSchema.optional(),
  taxId: z.string().max(50).optional(),
  defaultExpenseAccountId: uuidSchema.optional(),
  currency: z.string().length(3).default('USD'),
  externalId: z.string().max(255).optional(),
  customFields: customFieldValuesSchema,
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = createVendorSchema
  .omit({ customFields: true })
  .partial()
  .extend({
    customFields: customFieldValuesSchema,
  });

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

// ── Contacts ────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  customerId: uuidSchema.optional(),
  vendorId: uuidSchema.optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  isPrimary: z.boolean().default(false),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial();

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// ── Employees ───────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  userId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  managerId: uuidSchema.optional(),
  hireDate: z.string().datetime().optional(),
  status: z.enum(['active', 'inactive', 'terminated']).default('active'),
  bamboohrId: z.string().max(100).optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  terminationDate: z.string().datetime().optional(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// ── Items ───────────────────────────────────────────────────────────

export const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  itemType: z.enum(['service', 'inventory', 'non_inventory', 'other']).default('service'),
  unitOfMeasure: z.string().max(50).optional(),
  revenueAccountId: uuidSchema.optional(),
  expenseAccountId: uuidSchema.optional(),
  cogsAccountId: uuidSchema.optional(),
  standardCost: z.number().int().nonnegative().optional(),
  listPrice: z.number().int().nonnegative().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// ── Departments ─────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  entityId: uuidSchema.optional(),
  parentId: uuidSchema.optional(),
  managerEmployeeId: uuidSchema.optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

// ── Locations ───────────────────────────────────────────────────────

export const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  address: addressSchema,
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ── Legal Entities ──────────────────────────────────────────────────

export const createLegalEntitySchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  currency: z.string().length(3).default('USD'),
  address: addressSchema,
  taxId: z.string().max(50).optional(),
});

export type CreateLegalEntityInput = z.infer<typeof createLegalEntitySchema>;

export const updateLegalEntitySchema = createLegalEntitySchema.partial();

export type UpdateLegalEntityInput = z.infer<typeof updateLegalEntitySchema>;

// ── Projects ────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  customerId: uuidSchema.optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled']).default('active'),
  projectType: z.string().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budgetAmount: z.number().int().nonnegative().optional(),
  managerEmployeeId: uuidSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ── Cost Centers ────────────────────────────────────────────────────

export const createCostCenterSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  departmentId: uuidSchema.optional(),
});

export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>;

export const updateCostCenterSchema = createCostCenterSchema.partial();

export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>;

// ── Payment Terms ───────────────────────────────────────────────────

export const createPaymentTermsSchema = z.object({
  name: z.string().min(1).max(255),
  daysDue: z.number().int().nonnegative(),
  discountDays: z.number().int().nonnegative().optional(),
  discountPercent: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

export type CreatePaymentTermsInput = z.infer<typeof createPaymentTermsSchema>;

export const updatePaymentTermsSchema = createPaymentTermsSchema.partial();

export type UpdatePaymentTermsInput = z.infer<typeof updatePaymentTermsSchema>;

// ── Tax Codes ───────────────────────────────────────────────────────

export const createTaxCodeSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  rate: z.string().regex(/^\d+(\.\d{1,4})?$/),
});

export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;

export const updateTaxCodeSchema = createTaxCodeSchema.partial();

export type UpdateTaxCodeInput = z.infer<typeof updateTaxCodeSchema>;

// ── Currencies ──────────────────────────────────────────────────────

export const createCurrencySchema = z.object({
  code: z.string().length(3),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10),
  decimalPlaces: z.number().int().nonnegative().max(8).default(2),
});

export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;

export const updateCurrencySchema = createCurrencySchema.omit({ code: true }).partial();

export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;
