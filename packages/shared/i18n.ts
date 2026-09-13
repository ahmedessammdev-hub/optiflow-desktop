export const ar: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  bank_transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
  other: "أخرى",
  frames: "إطارات",
  sunglasses: "نظارات شمسية",
  lenses: "عدسات طبية",
  contact_lenses: "عدسات لاصقة",
  accessories: "إكسسوارات",
  admin: "مدير النظام",
  manager: "مدير المحل",
  sales: "المبيعات",
  inventory: "المخزون",
  cashier: "أمين الصندوق",
  draft: "مسودة",
  received: "مستلم",
  completed: "مكتمل",
  paid: "مدفوع",
  invoice: "فاتورة",
  payment: "دفعة",
  refund: "استرداد",
  return: "مرتجع",
  purchase: "شراء",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  opening_stock: "رصيد افتتاحي",
  manual_adjustment: "تسوية يدوية",
  damage: "تالف",
  loss: "فاقد",
  sale_payment: "دفعة بيع",
  debt_payment: "تحصيل مديونية",
  supplier_payment: "دفعة مورد",
  expense: "مصروف",
  cash_in: "إيداع نقدي",
  cash_out: "سحب نقدي",
  opening_balance: "رصيد افتتاحي",
  payment_reversal: "عكس دفعة",
  today: "اليوم",
  yesterday: "أمس",
  this_week: "هذا الأسبوع",
  last_7_days: "آخر ٧ أيام",
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  this_quarter: "هذا الربع",
  this_year: "هذا العام",
  last_year: "العام الماضي",
  custom: "فترة مخصصة",
  create: "إنشاء",
  update: "تعديل",
  archive: "أرشفة",
  login: "تسجيل دخول",
  checkout: "إتمام بيع",
  receive: "استلام",
  open: "فتح",
  close: "إغلاق",
  adjust: "تسوية",
  customers: "العملاء",
  products: "المنتجات",
  users: "المستخدمون",
  prescriptions: "الوصفات الطبية",
  settings: "الإعدادات",
  payments: "الدفعات",
  purchase_orders: "أوامر الشراء",
  cash_sessions: "جلسات الخزينة",
  roles: "الأدوار",
  backup: "نسخة احتياطية",
  permissions_update: "تعديل الصلاحيات",
  password_reset: "إعادة تعيين كلمة المرور",
  password_change: "تغيير كلمة المرور",
  attach: "إرفاق مستند",
  import: "استيراد",
  "Permission denied": "ليست لديك صلاحية لتنفيذ هذا الإجراء",
  "Login required": "يرجى تسجيل الدخول",
  "Session expired": "انتهت الجلسة، سجل الدخول مرة أخرى",
  "Insufficient stock": "المخزون غير كافٍ",
  "Insufficient cash in drawer": "النقدية المتاحة في الخزينة غير كافية",
  "Open the cash drawer before recording cash transactions":
    "افتح الخزينة قبل تسجيل عملية نقدية",
  "Invalid discount or tax": "قيمة الخصم أو الضريبة غير صالحة",
  "Payment exceeds invoice total": "الدفعة تتجاوز إجمالي الفاتورة",
  "Payment exceeds remaining balance": "الدفعة تتجاوز الرصيد المتبقي",
  "Supplier payment exceeds balance": "دفعة المورد تتجاوز الرصيد المتبقي",
  "A customer is required for partial payment":
    "يجب اختيار عميل عند الدفع الجزئي",
  "Return exceeds remaining sold quantity":
    "كمية المرتجع تتجاوز الكمية المباعة المتبقية",
  "Duplicate return line": "المنتج مكرر في المرتجع",
  "Purchase is not a draft": "تم استلام أمر الشراء بالفعل أو لا يمكن استلامه",
  "Product not found": "المنتج غير موجود",
  "Customer not found": "العميل غير موجود",
  "Invoice not found": "الفاتورة غير موجودة",
  "Invalid credentials or account temporarily locked":
    "بيانات الدخول غير صحيحة أو الحساب مقفل مؤقتًا",
  "Too many attempts. Try again in 30 seconds.":
    "محاولات كثيرة، حاول بعد ٣٠ ثانية",
  "Incorrect current password": "كلمة المرور الحالية غير صحيحة",
  "Enter a nonnegative amount with at most two decimals":
    "أدخل مبلغًا غير سالب بحد أقصى منزلتين عشريتين",
  "Duplicate phone: review the existing customer before explicitly allowing a duplicate":
    "رقم الهاتف مكرر؛ راجع العميل الموجود قبل السماح بالتكرار",
  "Payment cannot be reversed": "لا يمكن عكس هذه الدفعة",
  "The last administrator must remain active": "يجب الإبقاء على آخر مدير نشط",
  "You cannot disable or demote your own administrator account":
    "لا يمكنك تعطيل حساب المدير الذي تستخدمه أو خفض صلاحياته",
  "Open a print preview first": "افتح معاينة الطباعة أولًا",
  "Attachment exceeds 20 MB": "حجم المرفق يتجاوز ٢٠ ميجابايت",
  "Unsupported attachment content": "نوع محتوى المرفق غير مدعوم",
  "Store logo must be an image": "يجب أن يكون شعار المحل صورة",
};
export function translateValue(value: string, language: string) {
  if (language !== "ar") return value;
  if (ar[value]) return ar[value];
  const parts = value.split(".");
  if (parts.length === 2)
    return `${ar[parts[0]] ?? parts[0]}: ${ar[parts[1]] ?? ({ view: "عرض", manage: "إدارة", reverse: "عكس", discount: "خصم", override_price: "تغيير السعر", return: "إرجاع" } as Record<string, string>)[parts[1]] ?? parts[1]}`;
  return value;
}
export function translatedError(message: string, language: string) {
  if (language !== "ar") return message;
  return (
    ar[message] ??
    (message.startsWith("Invalid input")
      ? "البيانات المدخلة غير صالحة. راجع الحقول المطلوبة والقيم والحدود المسموح بها."
      : "تعذر إتمام العملية. راجع البيانات والصلاحيات؛ تم حفظ التفاصيل الفنية في سجل التطبيق.")
  );
}
