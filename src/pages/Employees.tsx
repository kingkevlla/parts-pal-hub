import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Users, UserCheck, UserX, Calendar, Clock, Star, DollarSign, Banknote, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useDataTable } from "@/hooks/useDataTable";
import { DataTableSearch, DataTablePagination, DataTableBulkActions, SelectAllCheckbox } from "@/components/ui/data-table-controls";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInDays } from "date-fns";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  hire_date: string;
  department: string | null;
  position: string | null;
  employment_type: string | null;
  salary: number;
  salary_type: string | null;
  status: string | null;
  avatar_url: string | null;
  address: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  notes: string | null;
}

interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  employees?: { first_name: string; last_name: string } | null;
}

interface Leave {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string | null;
  reason: string | null;
  employees?: { first_name: string; last_name: string } | null;
}

interface Payroll {
  id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  base_salary: number;
  deductions: number;
  bonuses: number;
  net_pay: number;
  status: string | null;
  employees?: { first_name: string; last_name: string } | null;
}

interface EmployeeLoan {
  id: string;
  employee_id: string;
  amount: number;
  paid_amount: number;
  monthly_deduction: number;
  loan_date: string;
  due_date: string | null;
  status: string | null;
  reason: string | null;
  notes: string | null;
  employees?: { first_name: string; last_name: string } | null;
}

interface EmployeeLoanPayment {
  id: string;
  loan_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  notes: string | null;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [employeeLoans, setEmployeeLoans] = useState<EmployeeLoan[]>([]);
  const [loanPayments, setLoanPayments] = useState<EmployeeLoanPayment[]>([]);
  const [isEmployeeOpen, setIsEmployeeOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);
  const [isLoanOpen, setIsLoanOpen] = useState(false);
  const [isLoanPaymentOpen, setIsLoanPaymentOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();

  const employeeTable = useDataTable({
    data: employees,
    searchFields: ['first_name', 'last_name', 'email', 'phone', 'department', 'position'] as (keyof Employee)[],
    defaultPageSize: 50,
  });

  // Stats
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const totalSalary = employees.filter(e => e.status === 'active').reduce((sum, e) => sum + (e.salary || 0), 0);
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
  const totalLoans = employeeLoans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.amount - l.paid_amount), 0);

  useEffect(() => {
    fetchEmployees();
    fetchAttendance();
    fetchLeaves();
    fetchPayrolls();
    fetchEmployeeLoans();
  }, []);

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from('employees').select('*').order('first_name');
    if (!error) setEmployees(data || []);
  };

  const fetchAttendance = async () => {
    const { data, error } = await supabase
      .from('employee_attendance')
      .select('*, employees(first_name, last_name)')
      .order('date', { ascending: false })
      .limit(100);
    if (!error) setAttendance(data || []);
  };

  const fetchLeaves = async () => {
    const { data, error } = await supabase
      .from('employee_leave')
      .select('*, employees(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (!error) setLeaves(data || []);
  };

  const fetchPayrolls = async () => {
    const { data, error } = await supabase
      .from('employee_payroll')
      .select('*, employees(first_name, last_name)')
      .order('pay_period_start', { ascending: false });
    if (!error) setPayrolls(data || []);
  };

  const fetchEmployeeLoans = async () => {
    const { data, error } = await supabase
      .from('employee_loans')
      .select('*, employees(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (!error) setEmployeeLoans((data as any) || []);
  };

  const fetchLoanPayments = async (loanId: string) => {
    const { data, error } = await supabase
      .from('employee_loan_payments')
      .select('*')
      .eq('loan_id', loanId)
      .order('payment_date', { ascending: false });
    if (!error) setLoanPayments((data as any) || []);
  };

  const handleEmployeeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const employeeData = {
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        email: formData.get('email') as string || null,
        phone: formData.get('phone') as string || null,
        hire_date: formData.get('hire_date') as string,
        department: formData.get('department') as string || null,
        position: formData.get('position') as string || null,
        employment_type: formData.get('employment_type') as string || 'full_time',
        salary: parseFloat(formData.get('salary') as string) || 0,
        salary_type: formData.get('salary_type') as string || 'monthly',
        status: formData.get('status') as string || 'active',
        address: formData.get('address') as string || null,
        emergency_contact: formData.get('emergency_contact') as string || null,
        emergency_phone: formData.get('emergency_phone') as string || null,
        notes: formData.get('notes') as string || null,
      };

      if (editingEmployee) {
        const { error } = await supabase.from('employees').update(employeeData).eq('id', editingEmployee.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Employee updated' });
      } else {
        const { error } = await supabase.from('employees').insert(employeeData);
        if (error) throw error;
        toast({ title: 'Success', description: 'Employee created' });
      }

      setIsEmployeeOpen(false);
      setEditingEmployee(null);
      fetchEmployees();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleAttendanceSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const { error } = await supabase.from('employee_attendance').insert({
        employee_id: formData.get('employee_id') as string,
        date: formData.get('date') as string,
        check_in: formData.get('check_in') as string || null,
        check_out: formData.get('check_out') as string || null,
        status: formData.get('status') as string || 'present',
        notes: formData.get('notes') as string || null,
      });

      if (error) throw error;
      toast({ title: 'Success', description: 'Attendance recorded' });
      setIsAttendanceOpen(false);
      fetchAttendance();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleLeaveSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const { error } = await supabase.from('employee_leave').insert({
        employee_id: formData.get('employee_id') as string,
        leave_type: formData.get('leave_type') as string,
        start_date: formData.get('start_date') as string,
        end_date: formData.get('end_date') as string,
        reason: formData.get('reason') as string || null,
        status: 'pending',
      });

      if (error) throw error;
      toast({ title: 'Success', description: 'Leave request submitted' });
      setIsLeaveOpen(false);
      fetchLeaves();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handlePayrollSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const baseSalary = parseFloat(formData.get('base_salary') as string) || 0;
      const deductions = parseFloat(formData.get('deductions') as string) || 0;
      const bonuses = parseFloat(formData.get('bonuses') as string) || 0;

      const { error } = await supabase.from('employee_payroll').insert({
        employee_id: formData.get('employee_id') as string,
        pay_period_start: formData.get('pay_period_start') as string,
        pay_period_end: formData.get('pay_period_end') as string,
        base_salary: baseSalary,
        deductions,
        bonuses,
        net_pay: baseSalary - deductions + bonuses,
        payment_method: formData.get('payment_method') as string || null,
        status: 'pending',
        created_by: user?.id,
      });

      if (error) throw error;
      toast({ title: 'Success', description: 'Payroll created' });
      setIsPayrollOpen(false);
      fetchPayrolls();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleDeleteEmployee = async () => {
    if (!deleteEmployee) return;
    const { error } = await supabase.from('employees').delete().eq('id', deleteEmployee.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Employee deleted' });
      fetchEmployees();
    }
    setDeleteEmployee(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(employeeTable.selectedIds);
    const { error } = await supabase.from('employees').delete().in('id', ids);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `${ids.length} employees deleted` });
      employeeTable.clearSelection();
      fetchEmployees();
    }
  };

  const updateLeaveStatus = async (leaveId: string, status: string) => {
    const { error } = await supabase
      .from('employee_leave')
      .update({ status, approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq('id', leaveId);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `Leave ${status}` });
      fetchLeaves();
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-600">Active</Badge>;
      case 'inactive': return <Badge variant="secondary">Inactive</Badge>;
      case 'terminated': return <Badge variant="destructive">Terminated</Badge>;
      case 'on_leave': return <Badge className="bg-orange-500">On Leave</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getLeaveStatusBadge = (status: string | null) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-600">Approved</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getLoanStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active': return <Badge className="bg-blue-600">Active</Badge>;
      case 'paid': return <Badge className="bg-green-600">Paid</Badge>;
      case 'defaulted': return <Badge variant="destructive">Defaulted</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const { error } = await supabase.from('employee_loans').insert({
        employee_id: formData.get('employee_id') as string,
        amount: parseFloat(formData.get('amount') as string),
        monthly_deduction: parseFloat(formData.get('monthly_deduction') as string) || 0,
        loan_date: formData.get('loan_date') as string,
        due_date: (formData.get('due_date') as string) || null,
        reason: (formData.get('reason') as string) || null,
        notes: (formData.get('notes') as string) || null,
        status: 'active',
        created_by: user?.id,
      } as any);
      if (error) throw error;
      toast({ title: 'Success', description: 'Employee loan created' });
      setIsLoanOpen(false);
      fetchEmployeeLoans();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleLoanPaymentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoanId) return;
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const paymentAmount = parseFloat(formData.get('amount') as string);
      
      const { error } = await supabase.from('employee_loan_payments').insert({
        loan_id: selectedLoanId,
        amount: paymentAmount,
        payment_date: formData.get('payment_date') as string,
        payment_method: (formData.get('payment_method') as string) || null,
        notes: (formData.get('notes') as string) || null,
        created_by: user?.id,
      } as any);
      if (error) throw error;

      // Update loan paid_amount
      const loan = employeeLoans.find(l => l.id === selectedLoanId);
      if (loan) {
        const newPaidAmount = loan.paid_amount + paymentAmount;
        const newStatus = newPaidAmount >= loan.amount ? 'paid' : 'active';
        await supabase.from('employee_loans')
          .update({ paid_amount: newPaidAmount, status: newStatus } as any)
          .eq('id', selectedLoanId);
      }

      toast({ title: 'Success', description: 'Loan payment recorded' });
      setIsLoanPaymentOpen(false);
      setSelectedLoanId(null);
      fetchEmployeeLoans();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Employees</h1>
          <p className="text-muted-foreground">Manage staff, attendance, leave and payroll</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={isAttendanceOpen} onOpenChange={setIsAttendanceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Clock className="h-4 w-4 mr-2" />Attendance</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Attendance</DialogTitle></DialogHeader>
              <form onSubmit={handleAttendanceSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="att-employee">Employee *</Label>
                  <Select name="employee_id" required>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === 'active').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="att-date">Date *</Label>
                    <Input id="att-date" name="date" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="att-status">Status</Label>
                    <Select name="status" defaultValue="present">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="half_day">Half Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="check_in">Check In</Label>
                    <Input id="check_in" name="check_in" type="time" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="check_out">Check Out</Label>
                    <Input id="check_out" name="check_out" type="time" />
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Saving...' : 'Record Attendance'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Calendar className="h-4 w-4 mr-2" />Leave Request</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Submit Leave Request</DialogTitle></DialogHeader>
              <form onSubmit={handleLeaveSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="leave-employee">Employee *</Label>
                  <Select name="employee_id" required>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === 'active').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave_type">Leave Type *</Label>
                  <Select name="leave_type" required>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="personal">Personal Leave</SelectItem>
                      <SelectItem value="maternity">Maternity Leave</SelectItem>
                      <SelectItem value="paternity">Paternity Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date *</Label>
                    <Input id="start_date" name="start_date" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date *</Label>
                    <Input id="end_date" name="end_date" type="date" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea id="reason" name="reason" />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Submitting...' : 'Submit Request'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isPayrollOpen} onOpenChange={setIsPayrollOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><DollarSign className="h-4 w-4 mr-2" />Payroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Payroll</DialogTitle></DialogHeader>
              <form onSubmit={handlePayrollSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-employee">Employee *</Label>
                  <Select name="employee_id" required>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === 'active').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} - {formatAmount(e.salary)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pay_period_start">Period Start *</Label>
                    <Input id="pay_period_start" name="pay_period_start" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay_period_end">Period End *</Label>
                    <Input id="pay_period_end" name="pay_period_end" type="date" required />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="base_salary">Base Salary *</Label>
                    <Input id="base_salary" name="base_salary" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deductions">Deductions</Label>
                    <Input id="deductions" name="deductions" type="number" step="0.01" defaultValue="0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bonuses">Bonuses</Label>
                    <Input id="bonuses" name="bonuses" type="number" step="0.01" defaultValue="0" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Payment Method</Label>
                  <Select name="payment_method">
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Creating...' : 'Create Payroll'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isLoanOpen} onOpenChange={setIsLoanOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Banknote className="h-4 w-4 mr-2" />Employee Loan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Employee Loan</DialogTitle></DialogHeader>
              <form onSubmit={handleLoanSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loan-employee">Employee *</Label>
                  <Select name="employee_id" required>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === 'active').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan-amount">Loan Amount *</Label>
                    <Input id="loan-amount" name="amount" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthly_deduction">Monthly Deduction</Label>
                    <Input id="monthly_deduction" name="monthly_deduction" type="number" step="0.01" defaultValue="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan_date">Loan Date *</Label>
                    <Input id="loan_date" name="loan_date" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loan_due_date">Due Date</Label>
                    <Input id="loan_due_date" name="due_date" type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loan-reason">Reason</Label>
                  <Input id="loan-reason" name="reason" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loan-notes">Notes</Label>
                  <Textarea id="loan-notes" name="notes" />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Creating...' : 'Create Loan'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isLoanPaymentOpen} onOpenChange={(open) => { setIsLoanPaymentOpen(open); if (!open) setSelectedLoanId(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Loan Payment</DialogTitle></DialogHeader>
              <form onSubmit={handleLoanPaymentSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-amount">Payment Amount *</Label>
                  <Input id="pay-amount" name="amount" type="number" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_date">Payment Date *</Label>
                  <Input id="payment_date" name="payment_date" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay-method">Payment Method</Label>
                  <Select name="payment_method">
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salary_deduction">Salary Deduction</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay-notes">Notes</Label>
                  <Textarea id="pay-notes" name="notes" />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Recording...' : 'Record Payment'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isEmployeeOpen} onOpenChange={(open) => { setIsEmployeeOpen(open); if (!open) setEditingEmployee(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Employee</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingEmployee ? 'Edit' : 'Add'} Employee</DialogTitle></DialogHeader>
              <form onSubmit={handleEmployeeSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input id="first_name" name="first_name" required defaultValue={editingEmployee?.first_name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input id="last_name" name="last_name" required defaultValue={editingEmployee?.last_name} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" defaultValue={editingEmployee?.email || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" defaultValue={editingEmployee?.phone || ''} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" name="department" defaultValue={editingEmployee?.department || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">Position</Label>
                    <Input id="position" name="position" defaultValue={editingEmployee?.position || ''} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hire_date">Hire Date *</Label>
                    <Input id="hire_date" name="hire_date" type="date" required defaultValue={editingEmployee?.hire_date || format(new Date(), 'yyyy-MM-dd')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employment_type">Employment Type</Label>
                    <Select name="employment_type" defaultValue={editingEmployee?.employment_type || 'full_time'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full Time</SelectItem>
                        <SelectItem value="part_time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select name="status" defaultValue={editingEmployee?.status || 'active'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="salary">Salary</Label>
                    <Input id="salary" name="salary" type="number" step="0.01" defaultValue={editingEmployee?.salary || 0} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary_type">Salary Type</Label>
                    <Select name="salary_type" defaultValue={editingEmployee?.salary_type || 'monthly'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" name="address" defaultValue={editingEmployee?.address || ''} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact">Emergency Contact</Label>
                    <Input id="emergency_contact" name="emergency_contact" defaultValue={editingEmployee?.emergency_contact || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_phone">Emergency Phone</Label>
                    <Input id="emergency_phone" name="emergency_phone" defaultValue={editingEmployee?.emergency_phone || ''} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" defaultValue={editingEmployee?.notes || ''} />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Saving...' : 'Save Employee'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(totalSalary)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
            <Calendar className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{pendingLeaves}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(totalLoans)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave Requests</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
              <DataTableSearch value={employeeTable.searchTerm} onChange={employeeTable.setSearchTerm} placeholder="Search employees..." />
              <DataTableBulkActions selectedCount={employeeTable.selectedIds.size} onDelete={handleBulkDelete} itemName="employees" />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left">
                        <SelectAllCheckbox isAllSelected={employeeTable.isAllSelected} isSomeSelected={employeeTable.isSomeSelected} onToggle={employeeTable.selectAll} />
                      </th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Department</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Position</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Salary</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeTable.paginatedData.map((emp) => (
                      <tr key={emp.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <Checkbox checked={employeeTable.selectedIds.has(emp.id)} onCheckedChange={() => employeeTable.toggleSelect(emp.id)} />
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={emp.avatar_url || ''} />
                              <AvatarFallback>{emp.first_name[0]}{emp.last_name[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                              <p className="text-xs text-muted-foreground">{emp.email || emp.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">{emp.department || '-'}</td>
                        <td className="py-3 px-2">{emp.position || '-'}</td>
                        <td className="py-3 px-2 font-medium">{formatAmount(emp.salary)}/{emp.salary_type?.slice(0, 2)}</td>
                        <td className="py-3 px-2">{getStatusBadge(emp.status)}</td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingEmployee(emp); setIsEmployeeOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteEmployee(emp)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTablePagination currentPage={employeeTable.currentPage} totalPages={employeeTable.totalPages} pageSize={employeeTable.pageSize} totalItems={employeeTable.totalItems} onPageChange={employeeTable.goToPage} onPageSizeChange={employeeTable.changePageSize} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Date</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Check In</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Check Out</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((att) => (
                      <tr key={att.id} className="border-b">
                        <td className="py-3 px-2">{format(new Date(att.date), 'MMM d, yyyy')}</td>
                        <td className="py-3 px-2">{att.employees?.first_name} {att.employees?.last_name}</td>
                        <td className="py-3 px-2">{att.check_in || '-'}</td>
                        <td className="py-3 px-2">{att.check_out || '-'}</td>
                        <td className="py-3 px-2"><Badge variant={att.status === 'present' ? 'default' : 'secondary'}>{att.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Type</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Period</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Days</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Reason</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((leave) => (
                      <tr key={leave.id} className="border-b">
                        <td className="py-3 px-2">{leave.employees?.first_name} {leave.employees?.last_name}</td>
                        <td className="py-3 px-2 capitalize">{leave.leave_type.replace('_', ' ')}</td>
                        <td className="py-3 px-2 text-sm">
                          {format(new Date(leave.start_date), 'MMM d')} - {format(new Date(leave.end_date), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-2">{differenceInDays(new Date(leave.end_date), new Date(leave.start_date)) + 1}</td>
                        <td className="py-3 px-2 text-sm text-muted-foreground max-w-[200px] truncate">{leave.reason || '-'}</td>
                        <td className="py-3 px-2">{getLeaveStatusBadge(leave.status)}</td>
                        <td className="py-3 px-2">
                          {leave.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="text-green-600" onClick={() => updateLeaveStatus(leave.id, 'approved')}>
                                Approve
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateLeaveStatus(leave.id, 'rejected')}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Period</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Base</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Deductions</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Bonuses</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Net Pay</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrolls.map((pay) => (
                      <tr key={pay.id} className="border-b">
                        <td className="py-3 px-2">{pay.employees?.first_name} {pay.employees?.last_name}</td>
                        <td className="py-3 px-2 text-sm">
                          {format(new Date(pay.pay_period_start), 'MMM d')} - {format(new Date(pay.pay_period_end), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-2">{formatAmount(pay.base_salary)}</td>
                        <td className="py-3 px-2 text-red-600">-{formatAmount(pay.deductions)}</td>
                        <td className="py-3 px-2 text-green-600">+{formatAmount(pay.bonuses)}</td>
                        <td className="py-3 px-2 font-bold">{formatAmount(pay.net_pay)}</td>
                        <td className="py-3 px-2"><Badge variant={pay.status === 'paid' ? 'default' : 'secondary'}>{pay.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Amount</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Paid</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Balance</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Monthly Deduction</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Loan Date</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Due Date</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Reason</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeLoans.map((loan) => (
                      <tr key={loan.id} className="border-b">
                        <td className="py-3 px-2">{loan.employees?.first_name} {loan.employees?.last_name}</td>
                        <td className="py-3 px-2 font-medium">{formatAmount(loan.amount)}</td>
                        <td className="py-3 px-2 text-green-600">{formatAmount(loan.paid_amount)}</td>
                        <td className="py-3 px-2 font-bold">{formatAmount(loan.amount - loan.paid_amount)}</td>
                        <td className="py-3 px-2">{loan.monthly_deduction ? formatAmount(loan.monthly_deduction) : '-'}</td>
                        <td className="py-3 px-2 text-sm">{format(new Date(loan.loan_date), 'MMM d, yyyy')}</td>
                        <td className="py-3 px-2 text-sm">{loan.due_date ? format(new Date(loan.due_date), 'MMM d, yyyy') : '-'}</td>
                        <td className="py-3 px-2 text-sm text-muted-foreground max-w-[150px] truncate">{loan.reason || '-'}</td>
                        <td className="py-3 px-2">{getLoanStatusBadge(loan.status)}</td>
                        <td className="py-3 px-2">
                          {loan.status === 'active' && (
                            <Button variant="outline" size="sm" onClick={() => { setSelectedLoanId(loan.id); setIsLoanPaymentOpen(true); }}>
                              <CreditCard className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {employeeLoans.length === 0 && (
                      <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No employee loans found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteEmployee} onOpenChange={(open) => !open && setDeleteEmployee(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {deleteEmployee?.first_name} {deleteEmployee?.last_name} and all related records.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEmployee}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
