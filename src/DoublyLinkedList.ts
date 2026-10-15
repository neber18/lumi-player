/**
 * Lista doblemente enlazada genérica.
 * Cada nodo conoce a su anterior (prev) y a su siguiente (next).
 * Los nodos mantienen su identidad al moverse, así el reproductor
 * nunca "pierde" la canción actual cuando se reordena la lista.
 */
export class DNode<T> {
  prev: DNode<T> | null = null;
  next: DNode<T> | null = null;
  constructor(public value: T) {}
}

export class DoublyLinkedList<T> implements Iterable<T> {
  head: DNode<T> | null = null;
  tail: DNode<T> | null = null;
  private _size = 0;

  get size(): number {
    return this._size;
  }

  get isEmpty(): boolean {
    return this._size === 0;
  }

  /** Inserta al inicio. O(1) */
  addFirst(value: T): DNode<T> {
    const node = new DNode(value);
    this.attachAt(0, node);
    return node;
  }

  /** Inserta al final. O(1) */
  addLast(value: T): DNode<T> {
    const node = new DNode(value);
    this.attachAt(this._size, node);
    return node;
  }

  /** Inserta en una posición (0-based). Se ajusta a [0, size]. O(n/2) */
  insertAt(index: number, value: T): DNode<T> {
    const node = new DNode(value);
    this.attachAt(index, node);
    return node;
  }

  /** Obtiene el nodo en el índice, recorriendo desde el extremo más cercano. */
  nodeAt(index: number): DNode<T> | null {
    if (index < 0 || index >= this._size) return null;
    let current: DNode<T>;
    if (index < this._size / 2) {
      current = this.head!;
      for (let i = 0; i < index; i++) current = current.next!;
    } else {
      current = this.tail!;
      for (let i = this._size - 1; i > index; i--) current = current.prev!;
    }
    return current;
  }

  getAt(index: number): T | undefined {
    return this.nodeAt(index)?.value;
  }

  indexOf(node: DNode<T>): number {
    let i = 0;
    for (let n = this.head; n; n = n.next) {
      if (n === node) return i;
      i++;
    }
    return -1;
  }

  find(predicate: (value: T) => boolean): DNode<T> | null {
    for (let n = this.head; n; n = n.next) if (predicate(n.value)) return n;
    return null;
  }

  /** Quita un nodo concreto. O(1) */
  removeNode(node: DNode<T>): T {
    this.detach(node);
    return node.value;
  }

  removeAt(index: number): T | undefined {
    const node = this.nodeAt(index);
    return node ? this.removeNode(node) : undefined;
  }

  /**
   * Mueve el nodo de la posición `from` a la posición `to`
   * (posición final dentro de la lista). Reutiliza el mismo nodo.
   */
  move(from: number, to: number): boolean {
    if (from < 0 || from >= this._size) return false;
    to = Math.max(0, Math.min(to, this._size - 1));
    if (from === to) return false;
    const node = this.nodeAt(from)!;
    this.detach(node);
    this.attachAt(to, node);
    return true;
  }

  /** Mueve un nodo a continuación de otro (ej. "reproducir a continuación"). */
  moveAfter(node: DNode<T>, anchor: DNode<T>): void {
    if (node === anchor) return;
    this.detach(node);
    const anchorIndex = this.indexOf(anchor);
    this.attachAt(anchorIndex + 1, node);
  }

  /** Reordena conservando los nodos (útil para ordenar o mezclar). */
  reorder(compare: (a: T, b: T) => number): void {
    const nodes = Array.from(this.nodes()).sort((a, b) => compare(a.value, b.value));
    this.relink(nodes);
  }

  /** Invierte el orden de la lista conservando los nodos. O(n) */
  reverse(): void {
    this.relink(Array.from(this.nodes()).reverse());
  }

  /** Indica si algún elemento cumple el predicado. */
  contains(predicate: (value: T) => boolean): boolean {
    return this.find(predicate) !== null;
  }

  shuffle(): void {
    const nodes = Array.from(this.nodes());
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }
    this.relink(nodes);
  }

  clear(): void {
    this.head = this.tail = null;
    this._size = 0;
  }

  *nodes(): IterableIterator<DNode<T>> {
    for (let n = this.head; n; n = n.next) yield n;
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (const n of this.nodes()) yield n.value;
  }

  toArray(): T[] {
    return Array.from(this);
  }

  // ---------- internos ----------

  private attachAt(index: number, node: DNode<T>): void {
    node.prev = node.next = null;
    index = Math.max(0, Math.min(index, this._size));

    if (this._size === 0) {
      this.head = this.tail = node;
    } else if (index === 0) {
      node.next = this.head;
      this.head!.prev = node;
      this.head = node;
    } else if (index === this._size) {
      node.prev = this.tail;
      this.tail!.next = node;
      this.tail = node;
    } else {
      const at = this.nodeAt(index)!;
      const before = at.prev!;
      before.next = node;
      node.prev = before;
      node.next = at;
      at.prev = node;
    }
    this._size++;
  }

  private detach(node: DNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;

    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;

    node.prev = node.next = null;
    this._size--;
  }

  private relink(nodes: DNode<T>[]): void {
    this.head = nodes[0] ?? null;
    this.tail = nodes[nodes.length - 1] ?? null;
    nodes.forEach((n, i) => {
      n.prev = nodes[i - 1] ?? null;
      n.next = nodes[i + 1] ?? null;
    });
    this._size = nodes.length;
  }
}
