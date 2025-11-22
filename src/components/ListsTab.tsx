import React, { useState } from 'react';
import { Users, Plus, MoreVertical, Play, Pause, Trash2, Edit, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// DDI prefixes options
const DDI_PREFIXES = [
  { value: '0015', label: '0015 - Telefônica' },
  { value: '0021', label: '0021 - Embratel' },
  { value: '0031', label: '0031 - Oi' },
  { value: '0041', label: '0041 - TIM' },
];

interface NumberList {
  id: string;
  name: string;
  numbers: string[];
  createdAt: string;
  isActive: boolean;
  ddiPrefix?: string | null;
}

interface ListsTabProps {
  lists: NumberList[];
  onListAction: (listId: string, action: string, data?: any) => void;
}

export const ListsTab: React.FC<ListsTabProps> = ({ lists, onListAction }) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [selectedDDI, setSelectedDDI] = useState<string>('');
  const [newListName, setNewListName] = useState('');
  const [newListNumbers, setNewListNumbers] = useState('');
  const [newListDDI, setNewListDDI] = useState('');
  const [editingList, setEditingList] = useState<NumberList | null>(null);

  const activeLists = lists.filter(list => list.isActive);
  const inactiveLists = lists.filter(list => !list.isActive);

  const handleCreateList = () => {
    if (!newListName.trim() || !newListNumbers.trim()) return;

    const numbers = newListNumbers
      .split('\n')
      .map(num => num.trim())
      .filter(num => num.length > 0);

    onListAction('create', 'create', {
      name: newListName,
      numbers: numbers,
      ddiPrefix: newListDDI || undefined
    });

    setNewListName('');
    setNewListNumbers('');
    setNewListDDI('');
    setIsCreateDialogOpen(false);
  };

  const handleStartCampaign = (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    // Se a lista já tem DDI configurado, usar diretamente
    if (list.ddiPrefix) {
      onListAction(listId, 'call', { ddiPrefix: list.ddiPrefix });
      return;
    }

    // Caso contrário, mostrar diálogo para selecionar DDI
    setSelectedListId(listId);
    setIsCampaignDialogOpen(true);
  };

  const handleConfirmCampaign = () => {
    if (!selectedDDI || !selectedListId) return;

    onListAction(selectedListId, 'call', { ddiPrefix: selectedDDI });
    
    setSelectedListId('');
    setSelectedDDI('');
    setIsCampaignDialogOpen(false);
  };

  const handleEditList = (list: NumberList) => {
    setEditingList(list);
    setNewListName(list.name);
    setNewListNumbers(list.numbers.join('\n'));
    setNewListDDI(list.ddiPrefix || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateList = () => {
    if (!editingList || !newListName.trim() || !newListNumbers.trim()) return;

    const numbers = newListNumbers
      .split('\n')
      .map(num => num.trim())
      .filter(num => num.length > 0);

    // CORREÇÃO: Chama a ação de atualização (que agora é assíncrona no PBXDashboard)
    onListAction(editingList.id, 'update', {
      name: newListName,
      numbers: numbers,
      ddiPrefix: newListDDI || undefined
    });

    // Limpa os campos e fecha o diálogo
    // A atualização será refletida via real-time subscription do Supabase
    setNewListName('');
    setNewListNumbers('');
    setNewListDDI('');
    setEditingList(null);
    setIsEditDialogOpen(false);
  };

  if (lists.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma lista criada</h3>
        <p className="text-muted-foreground mb-6">
          Crie listas de números para facilitar o gerenciamento das chamadas
        </p>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Criar Nova Lista
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Lista</DialogTitle>
              <DialogDescription>
                Adicione um nome e os números de telefone para sua lista.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome da Lista</Label>
                <Input
                  id="name"
                  placeholder="Ex: Lista Principal"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ddi-select">Prefixo DDI (Operadora) - Opcional</Label>
                <Select value={newListDDI} onValueChange={setNewListDDI}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o prefixo DDI (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {DDI_PREFIXES.map((prefix) => (
                      <SelectItem key={prefix.value} value={prefix.value}>
                        {prefix.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="numbers">Números (um por linha)</Label>
                <Textarea
                  id="numbers"
                  placeholder="Ex:&#10;+55 11 99999-9999&#10;+55 11 88888-8888"
                  value={newListNumbers}
                  onChange={(e) => setNewListNumbers(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateList}>
                Criar Lista
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Listas de Números ({lists.length})
        </h3>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nova Lista
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Lista</DialogTitle>
              <DialogDescription>
                Adicione um nome e os números de telefone para sua lista.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome da Lista</Label>
                <Input
                  id="name"
                  placeholder="Ex: Lista Principal"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ddi-select">Prefixo DDI (Operadora) - Opcional</Label>
                <Select value={newListDDI} onValueChange={setNewListDDI}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o prefixo DDI (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {DDI_PREFIXES.map((prefix) => (
                      <SelectItem key={prefix.value} value={prefix.value}>
                        {prefix.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="numbers">Números (um por linha)</Label>
                <Textarea
                  id="numbers"
                  placeholder="Ex:&#10;+55 11 99999-9999&#10;+55 11 88888-8888"
                  value={newListNumbers}
                  onChange={(e) => setNewListNumbers(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateList}>
                Criar Lista
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaign Dialog */}
      <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar Campanha de Chamadas</DialogTitle>
            <DialogDescription>
              Selecione o prefixo DDI (operadora) para esta campanha.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ddi-prefix">Prefixo DDI (Operadora)</Label>
              <Select value={selectedDDI} onValueChange={setSelectedDDI}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o prefixo DDI" />
                </SelectTrigger>
                <SelectContent>
                  {DDI_PREFIXES.map((prefix) => (
                    <SelectItem key={prefix.value} value={prefix.value}>
                      {prefix.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCampaignDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmCampaign} disabled={!selectedDDI}>
              Iniciar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lista</DialogTitle>
            <DialogDescription>
              Modifique o nome e os números de telefone da lista.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome da Lista</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Lista Principal"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-ddi-select">Prefixo DDI (Operadora) - Opcional</Label>
              <Select value={newListDDI} onValueChange={setNewListDDI}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o prefixo DDI (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {DDI_PREFIXES.map((prefix) => (
                    <SelectItem key={prefix.value} value={prefix.value}>
                      {prefix.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-numbers">Números (um por linha)</Label>
              <Textarea
                id="edit-numbers"
                placeholder="Ex:&#10;+55 11 99999-9999&#10;+55 11 88888-8888"
                value={newListNumbers}
                onChange={(e) => setNewListNumbers(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateList}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Lists */}
      {activeLists.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-foreground mb-3 flex items-center">
            <Play className="w-4 h-4 mr-2 text-success" />
            Listas Ativas ({activeLists.length})
          </h4>

          <div className="space-y-3">
            {activeLists.map((list) => (
              <div 
                key={list.id} 
                className="border border-success/30 bg-success/5 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-success/10 rounded-lg">
                      <FileText className="w-4 h-4 text-success" />
                    </div>
                    <div>
                      <h5 className="font-medium text-foreground">{list.name}</h5>
                      <p className="text-sm text-muted-foreground">
                        {list.numbers.length} números • Criada {formatDistanceToNow(new Date(list.createdAt), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                        {list.ddiPrefix && ` • DDI: ${list.ddiPrefix}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge className="bg-success/20 text-success-foreground border-success/30">
                      Ativa
                    </Badge>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-background border shadow-md">
                        <DropdownMenuItem 
                          onClick={() => handleStartCampaign(list.id)}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Iniciar Chamadas
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleEditList(list)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onListAction(list.id, 'deactivate')}
                        >
                          <Pause className="w-4 h-4 mr-2" />
                          Desativar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="text-sm">
                  <p className="text-muted-foreground mb-2">Primeiros números:</p>
                  <div className="flex flex-wrap gap-2">
                    {list.numbers.slice(0, 3).map((number, index) => (
                      <Badge key={index} variant="outline" className="font-mono">
                        {number}
                      </Badge>
                    ))}
                    {list.numbers.length > 3 && (
                      <Badge variant="outline">
                        +{list.numbers.length - 3} mais
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inactive Lists */}
      {inactiveLists.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-foreground mb-3 flex items-center">
            <Pause className="w-4 h-4 mr-2 text-muted-foreground" />
            Listas Inativas ({inactiveLists.length})
          </h4>

          <div className="space-y-3">
            {inactiveLists.map((list) => (
              <div 
                key={list.id} 
                className="border border-border rounded-lg p-4 bg-muted/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-muted/30 rounded-lg">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h5 className="font-medium text-foreground">{list.name}</h5>
                      <p className="text-sm text-muted-foreground">
                        {list.numbers.length} números • Criada {formatDistanceToNow(new Date(list.createdAt), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                        {list.ddiPrefix && ` • DDI: ${list.ddiPrefix}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      Inativa
                    </Badge>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-background border shadow-md">
                        <DropdownMenuItem 
                          onClick={() => onListAction(list.id, 'activate')}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Ativar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleEditList(list)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onListAction(list.id, 'delete')}
                          className="text-danger"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="text-sm">
                  <p className="text-muted-foreground mb-2">Primeiros números:</p>
                  <div className="flex flex-wrap gap-2">
                    {list.numbers.slice(0, 3).map((number, index) => (
                      <Badge key={index} variant="outline" className="font-mono">
                        {number}
                      </Badge>
                    ))}
                    {list.numbers.length > 3 && (
                      <Badge variant="outline">
                        +{list.numbers.length - 3} mais
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};