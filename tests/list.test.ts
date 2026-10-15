import { DoublyLinkedList } from "../src/DoublyLinkedList";
import { check, finish } from "./helpers";

/** Verifica que prev/next, head/tail y size sean coherentes en ambos sentidos. */
function consistent<T>(l: DoublyLinkedList<T>): boolean {
  const fwd: T[] = [];
  let last = null;
  for (let n = l.head; n; n = n.next) {
    if (n.prev !== last) return false;
    fwd.push(n.value);
    last = n;
  }
  if (last !== l.tail || fwd.length !== l.size) return false;
  const back: T[] = [];
  for (let n = l.tail; n; n = n.prev) back.push(n.value);
  return back.reverse().join() === fwd.join();
}

const l = new DoublyLinkedList<string>();
l.addLast("B");
l.addFirst("A");
l.addLast("D");
l.insertAt(2, "C");
check("addFirst/addLast/insertAt -> A,B,C,D", l.toArray().join() === "A,B,C,D" && consistent(l));

l.insertAt(99, "E");
l.insertAt(-5, "Z");
check("insertAt ajusta límites -> Z,A,B,C,D,E", l.toArray().join() === "Z,A,B,C,D,E" && consistent(l));

check("nodeAt desde ambos extremos", l.getAt(1) === "A" && l.getAt(4) === "D" && l.getAt(6) === undefined);

l.removeAt(0);
l.removeAt(l.size - 1);
check("removeAt cabeza y cola -> A,B,C,D", l.toArray().join() === "A,B,C,D" && consistent(l));

const nodeC = l.nodeAt(2)!;
l.move(0, 3);
check("move(0,3) -> B,C,D,A", l.toArray().join() === "B,C,D,A" && consistent(l));
l.move(3, 0);
check("move(3,0) -> A,B,C,D", l.toArray().join() === "A,B,C,D" && consistent(l));
l.move(2, 1);
check("move(2,1) conserva el nodo y su vecindad", l.nodeAt(1) === nodeC && l.toArray().join() === "A,C,B,D" && consistent(l));

l.moveAfter(l.head!, l.tail!);
check("moveAfter(A, D) -> C,B,D,A", l.toArray().join() === "C,B,D,A" && consistent(l));

l.reorder((a, b) => a.localeCompare(b));
check("reorder alfabético", l.toArray().join() === "A,B,C,D" && consistent(l));

l.shuffle();
check("shuffle conserva elementos", l.toArray().sort().join() === "A,B,C,D" && consistent(l));

const one = new DoublyLinkedList<number>();
one.addFirst(1);
one.removeNode(one.head!);
check("lista de un elemento queda vacía y consistente", one.isEmpty && one.head === null && one.tail === null && consistent(one));

l.clear();
check("clear", l.size === 0 && l.head === null && l.tail === null);

/* ---------- reverse / contains ---------- */

const r = new DoublyLinkedList<number>();
[1, 2, 3, 4].forEach((n) => r.addLast(n));
const firstNode = r.head!;
r.reverse();
check("reverse -> 4,3,2,1", r.toArray().join() === "4,3,2,1" && consistent(r));
check("reverse conserva la identidad de los nodos", r.tail === firstNode);
check("contains encuentra y descarta", r.contains((n) => n === 3) && !r.contains((n) => n === 9));

const empty = new DoublyLinkedList<number>();
empty.reverse();
check("reverse en lista vacía no rompe", empty.isEmpty && empty.head === null && consistent(empty));

/* ---------- casos borde ---------- */

check("removeAt fuera de rango devuelve undefined", empty.removeAt(0) === undefined && r.removeAt(99) === undefined && r.removeAt(-1) === undefined);
check("nodeAt de lista vacía es null", empty.nodeAt(0) === null);
check("indexOf de nodo ajeno es -1", r.indexOf(new DoublyLinkedList<number>().addFirst(1)) === -1);
check("move con índice inválido devuelve false", r.move(-1, 0) === false && r.move(99, 0) === false && r.move(1, 1) === false);

const mid = new DoublyLinkedList<string>();
["a", "b", "c"].forEach((x) => mid.addLast(x));
mid.removeNode(mid.nodeAt(1)!);
check("removeNode del medio -> a,c", mid.toArray().join() === "a,c" && consistent(mid));

const iter = new DoublyLinkedList<number>();
[10, 20, 30].forEach((n) => iter.addLast(n));
check("es iterable con spread", [...iter].join() === "10,20,30");

finish("Todas las pruebas pasaron");
