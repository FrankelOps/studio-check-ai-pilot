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
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      case 'open': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
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

  if (loading) {
    return <div className="p-6">Loading action items...</div>;
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Action Items</h3>
          <p className="text-sm text-slate-600">Track and manage project tasks and follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1">
            {actionItems.length} Total
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            {filterByStatus('open').length} Open
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
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <Badge className={getPriorityColor(item.priority)}>
                {item.priority}
              </Badge>
              <Badge className={getStatusColor(item.status)}>
                {getStatusIcon(item.status)}
                {item.status.replace('_', ' ')}
              </Badge>
              {item.due_date && isOverdue(item.due_date) && item.status !== 'completed' && (
                <Badge className="bg-red-100 text-red-800">
                  Overdue
                </Badge>
              )}
            </div>
            <CardTitle className="text-base">{item.description}</CardTitle>
          </div>
          <Select 
            value={item.status} 
            onValueChange={(status) => onStatusUpdate(item.id, status)}
          >
            <SelectTrigger className="w-32">
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
      </CardHeader>
      
      <CardContent>
        <div className="space-y-2">
          {item.assigned_to_name && (
            <div className="flex items-center text-sm text-slate-600">
              <User className="h-4 w-4 mr-2" />
              Assigned to: {item.assigned_to_name}
            </div>
          )}
          
          {item.due_date && (
            <div className="flex items-center text-sm text-slate-600">
              <Calendar className="h-4 w-4 mr-2" />
              Due: {new Date(item.due_date).toLocaleDateString()}
              {isOverdue(item.due_date) && item.status !== 'completed' && (
                <span className="ml-2 text-red-600 font-medium">
                  ({Math.ceil((new Date().getTime() - new Date(item.due_date).getTime()) / (1000 * 60 * 60 * 24))} days overdue)
                </span>
              )}
            </div>
          )}

          {item.completed_at && (
            <div className="flex items-center text-sm text-green-600">
              <CheckCircle className="h-4 w-4 mr-2" />
              Completed: {new Date(item.completed_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}