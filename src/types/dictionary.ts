export type CategoryId = string;
export type StackId = string;

export type DictionaryStatus = 'active' | 'legacy' | 'experimental' | 'deprecated';

export type RelationKind =
  | 'built-on'
  | 'renders'
  | 'runs-on'
  | 'integrates-with'
  | 'stores-in'
  | 'served-by'
  | 'related-to';

export interface CategoryDifference {
  against: string;
  explanation: string;
}

export interface CategoryEntry {
  id: CategoryId;
  name: string;
  aliases?: string[];
  parentCategoryId?: CategoryId;
  summary: string;
  description: string;
  role: string;
  useCases: string[];
  differences: CategoryDifference[];
  relatedCategoryIds?: CategoryId[];
}

export interface StackRelationship {
  targetStackId: StackId;
  kind: RelationKind;
  label: string;
  explanation?: string;
}

export interface StackEntry {
  id: StackId;
  name: string;
  categoryId: CategoryId;
  summary: string;
  description: string;
  features: string[];
  useCases: string[];
  responsibilities: string[];
  relationships?: StackRelationship[];
  relatedStackIds?: StackId[];
  packageNames?: string[];
  aliases?: string[];
  officialUrl?: string;
  status: DictionaryStatus;
}

export type MapNode =
  | {
      kind: 'group';
      id: string;
      label: string;
      description?: string;
      children: MapNode[];
    }
  | {
      kind: 'category';
      categoryId: CategoryId;
      children: MapNode[];
    }
  | {
      kind: 'stack';
      stackId: StackId;
    };

export interface SearchResult {
  id: string;
  kind: 'category' | 'stack';
  name: string;
  summary: string;
  href: string;
  matchedField: 'name' | 'alias' | 'package' | 'summary';
}
