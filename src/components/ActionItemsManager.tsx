import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CheckCircle, Clock, AlertTriangle, User, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ActionItem {
  id: string;
  description: string;
  assigned_to_name: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ActionItemsManagerProps {
  projectId: string;
  className?: string;
}

export function ActionItemsManager({ projectId, className }: ActionItemsManagerProps) {
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchActionItems();
  }, [projectId]);

  const fetchActionItems = async () => {
    try {
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActionItems(data || []);
    } catch (error: any) {
      console.error('Error fetching action items:', error);
      toast({
        variant: "destructive",
        title: "Error loading action items",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const updateActionItemStatus = async (id: string, status: string) => {
    try {
      const updateData: any = { 
        status,
        updated_at: new Date().toISOString()
      };
      
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (status === 'open' || status === 'in_progress') {
        updateData.completed_at = null;
      }

      const { error } = await supabase
        .from('action_items')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await fetchActionItems();
      toast({
        title: "Action item updated",
        description: `Status changed to ${status.replace('_', ' ')}`,
      });
    } catch (error: any) {
      console.error('Error updating action item:', error);
      toast({
        variant: "destructive",
        title: "Error updating action item",
        description: error.message,
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-50 text-red-700 border border-red-200';
      case 'high': return 'bg-orange-50 text-orange-700 border border-orange-200';
      case 'medium': return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'low': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      default: return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'in_progress': return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'cancelled': return 'bg-slate-50 text-slate-700 border border-slate-200';
      case 'open': return 'bg-amber-50 text-amber-700 border border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'in_progress': return <Clock className="h-4 w-4" />;
      case 'open': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filterByStatus = (status: string) => {
    return actionItems.filter(item => item.status === status);
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const getDaysOverdue = (dueDate: string | null) => {
    if (!dueDate) return 0;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return <div className="p-6">Loading action items...</div>;
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Action Items</h3>
          <p className="text-slate-600">Track and manage project tasks and follow-ups</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1 text-sm">
            {actionItems.length} Total
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-sm bg-amber-50 text-amber-700 border-amber-200">
            {filterByStatus('open').length} Open
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-sm bg-emerald-50 text-emerald-700 border-emerald-200">
            {filterByStatus('completed').length} Completed
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="open" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="open" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Open ({filterByStatus('open').length})
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            In Progress ({filterByStatus('in_progress').length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Completed ({filterByStatus('completed').length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All ({actionItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-4">
          {filterByStatus('open').map((item) => (
            <ActionItemCard 
              key={item.id} 
              item={item} 
              onStatusUpdate={updateActionItemStatus}
              getPriorityColor={getPriorityColor}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              isOverdue={isOverdue}
            />
          ))}
          {filterByStatus('open').length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No open action items
            </div>
          )}
        </TabsContent>

        <TabsContent value="in_progress" className="space-y-4">
          {filterByStatus('in_progress').map((item) => (
            <ActionItemCard 
              key={item.id} 
              item={item} 
              onStatusUpdate={updateActionItemStatus}
              getPriorityColor={getPriorityColor}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              isOverdue={isOverdue}
            />
          ))}
          {filterByStatus('in_progress').length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No items in progress
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {filterByStatus('completed').map((item) => (
            <ActionItemCard 
              key={item.id} 
              item={item} 
              onStatusUpdate={updateActionItemStatus}
              getPriorityColor={getPriorityColor}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              isOverdue={isOverdue}
            />
          ))}
          {filterByStatus('completed').length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No completed items
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {actionItems.map((item) => (
            <ActionItemCard 
              key={item.id} 
              item={item} 
              onStatusUpdate={updateActionItemStatus}
              getPriorityColor={getPriorityColor}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              isOverdue={isOverdue}
            />
          ))}
          {actionItems.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No action items yet
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ActionItemCardProps {
  item: ActionItem;
  onStatusUpdate: (id: string, status: string) => void;
  getPriorityColor: (priority: string) => string;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
  isOverdue: (dueDate: string | null) => boolean;
}

function ActionItemCard({ 
  item, 
  onStatusUpdate, 
  getPriorityColor, 
  getStatusColor, 
  getStatusIcon,
  isOverdue 
}: ActionItemCardProps) {
  const getDaysOverdue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <Card className="rounded-xl shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.01]">
      <CardContent className="px-6 py-4">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <Badge className={`${getPriorityColor(item.priority)} font-medium`}>
                {item.priority.toUpperCase()}
              </Badge>
              <Badge className={`${getStatusColor(item.status)} font-medium`}>
                {getStatusIcon(item.status)}
                <span className="ml-1">{item.status.replace('_', ' ')}</span>
              </Badge>
              {item.due_date && isOverdue(item.due_date) && item.status !== 'completed' && (
                <Badge className="bg-red-50 text-red-700 border border-red-200 font-medium">
                  Overdue • {getDaysOverdue(item.due_date)} days
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 leading-tight">{item.description}</h3>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Checkbox for completion */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStatusUpdate(item.id, item.status === 'completed' ? 'open' : 'completed')}
              className={`h-8 w-8 rounded-full p-0 ${
                item.status === 'completed' 
                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' 
                  : 'hover:bg-slate-100'
              }`}
            >
              <CheckCircle className={`h-4 w-4 ${item.status === 'completed' ? 'fill-current' : ''}`} />
            </Button>
            
            <Select 
              value={item.status} 
              onValueChange={(status) => onStatusUpdate(item.id, status)}
            >
              <SelectTrigger className="w-36 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {item.assigned_to_name && (
            <div className="flex items-center text-slate-600">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Assigned to</p>
                <p className="font-medium">{item.assigned_to_name}</p>
              </div>
            </div>
          )}
          
          {item.due_date && (
            <div className="flex items-center text-slate-600">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                isOverdue(item.due_date) && item.status !== 'completed' 
                  ? 'bg-red-100' 
                  : 'bg-slate-100'
              }`}>
                <Calendar className={`h-4 w-4 ${
                  isOverdue(item.due_date) && item.status !== 'completed' 
                    ? 'text-red-600' 
                    : 'text-slate-600'
                }`} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Due date</p>
                <p className={`font-medium ${
                  isOverdue(item.due_date) && item.status !== 'completed' 
                    ? 'text-red-600' 
                    : ''
                }`}>
                  {new Date(item.due_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}

          {item.completed_at && (
            <div className="flex items-center text-slate-600">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center mr-3">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Completed</p>
                <p className="font-medium text-emerald-600">
                  {new Date(item.completed_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}