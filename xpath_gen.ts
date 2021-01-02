
type PropertyType = 'TagName' | 'ChildPosition' | 'InnerText' | 'Attribute'

type UseProperty = {
  propertyType: PropertyType
  attributeName?: string
}

type UsePropertySetting = UseProperty & {locked: boolean}

const getAttribute = (elem: HTMLElement, attributeName: string): any => {
  if(attributeName === 'class') {
    return elem.className === '' ? undefined : elem.className;
  } else {
    const v = (elem as any)[attributeName];
    return v === '' ? undefined : v;
  }
};

const hasProperty = (elem: HTMLElement, property: UseProperty): boolean => {
  if(property.propertyType === 'TagName' || property.propertyType === 'InnerText') return true;
  if(property.propertyType === 'ChildPosition') {
    return elem.parentElement !== null;
  }
  return getAttribute(elem, property.attributeName) !== undefined;
};

const getChildPosition = (elem: HTMLElement): number => 
  // TODO: assert not -1
  [...elem.parentElement.children].filter(e => e.tagName === elem.tagName).indexOf(elem) + 1;

const escapeXPath = (text: string): string => text; //TODO: implement

const toXPath = (elem: HTMLElement, props: UseProperty[]): string => {
  const containsType =
    (props: UseProperty[], type: PropertyType) =>
      props.some(p => p.propertyType === type);
  
  const tagXPath = 
    containsType(props, 'TagName') ?
      elem.tagName.toLowerCase() :
      '*';
  
  let xpathComponents = [];
  if(containsType(props, 'ChildPosition')) {
    xpathComponents.push(getChildPosition(elem).toString());
  }
  if(containsType(props, 'InnerText')) {
    xpathComponents.push(`text()='${escapeXPath(elem.innerText)}'`);
  }
  
  xpathComponents =
    xpathComponents.concat(
      props
        .filter(prop => prop.propertyType === 'Attribute')
        .map(prop => `@${prop.attributeName}='${getAttribute(elem, prop.attributeName)}'`)
    );
  
  return tagXPath + (xpathComponents.length > 0 ? '[' + xpathComponents.join(' and ') + ']': '');
};

const genXPaths = (elem : HTMLElement, useProperties : UsePropertySetting[]) : string[] => {
  const go = (elem : HTMLElement): string[] => {
    // TODO: assert (elem is not the whole document)
    const recur = (index: number): boolean[][] => {
      if(index >= useProperties.length) return [[]];
      const property = useProperties[index];
      if(hasProperty(elem, property)) {
        if(property.locked) {
          return recur(index + 1).map(ls => [true, ...ls]);
        }
        
        return recur(index + 1).map(ls => [false, ...ls])
          .concat(recur(index + 1).map(ls => [true, ...ls]));
      }
      return recur(index + 1).map(ls => [false, ...ls]);
    };
    
    const combs = recur(0);
    const xpaths = combs.map(comb => toXPath(elem, comb.map((toUse, i) => toUse ? useProperties[i] : undefined).filter(e => e !== undefined)));
    
    if(!elem.parentElement) {
      return xpaths;
    } else {
      return xpaths.concat(go(elem.parentElement).map(p => p + '/' + xpaths[xpaths.length - 1]));
    }
  };
  
  return go(elem).map(p => '//' + p);
};

const removeAfterUnique = (xpaths: string[]): string[] => {
  let i = 0;
  for(i = 0; i < xpaths.length; i++) {
    const iter = document.evaluate(xpaths[i], document, null, XPathResult.ANY_TYPE, null);
    iter.iterateNext();
    if(iter.iterateNext() === null) {
      break;
    }
  }
  
  return xpaths.slice(0, i + 1);
};

const getOneElement = (xpath: string) => {
  const iter = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
  return iter.iterateNext();
}

const props: UsePropertySetting[] = [
    {
        locked: true,
        propertyType: 'TagName'
    },
    {
        locked: false,
        propertyType: 'Attribute',
        attributeName: 'id'
    },
    {
        locked: false,
        propertyType: 'Attribute',
        attributeName: 'class'
    },
    {
        locked: false,
        propertyType: 'ChildPosition'
    },
  // {
  //   locked: true,
  //   propertyType: 'InnerText'
  // },
];

let defaultBackgroundColor = new Map<HTMLElement, string>();

const setHighlight = (elems: HTMLElement[], color: string): void => {
  elems.forEach(elem => {
    if(!defaultBackgroundColor.has(elem)) {
      defaultBackgroundColor.set(elem, elem.style.backgroundColor);
    }
    
    elem.style.backgroundColor = color;
  }
  );
};

function* enumrateXPath(documentOrHTMLElement: Document | HTMLElement, xpath: string) {
  let context = documentOrHTMLElement instanceof Document ? document.documentElement : documentOrHTMLElement;
  let result_type = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE;
  let results = document.evaluate(xpath, context, null, result_type);

  for (let i = 0; i < results.snapshotLength; i++)
    yield results.snapshotItem(i);
};

const resetHightlight = (elems: HTMLElement[]) => {
  elems.forEach((elm) => {
    elm.style.backgroundColor = defaultBackgroundColor.get(elm);
  });
};

type AddedXPath = {xpaths: string[], element: Node}

let pointedElement: EventTarget | undefined = undefined;
let addedXPaths: AddedXPath[] = []

//TODO: なぜか最後まで一意にならないときがある。（はてなブログトップページのタイトル取得時など）

//xpathを後ろから見ていって、最初に共通で出現するやつ。
//文字列だと最長共通部分列とかで解く
//commonで該当要素数が最小と最小かつインデックスが最小を出力
const getUnion = (addedXPaths: AddedXPath[]) : string | undefined => {
  const sortByTargetNumberAndIndex =
    (a: {targetNumber:number, index:number}, b: {targetNumber:number, index:number}) =>
      a.targetNumber < b.targetNumber ? -1 : a.targetNumber > b.targetNumber ? 1 : a.index < b.index ? -1 : a.index > b.index ? 1 : 0;
  
  const outerResults = 
    addedXPaths.map((addedXPath, j) => {
      const results =
        addedXPath.xpaths
          .map((xpath, index) => {
            const xpathElems = [...enumrateXPath(document, xpath)];
            return {
              xpath: xpath,
              index: index,
              isCommon: addedXPaths.every(p => xpathElems.indexOf(p.element) !== -1),
              targetNumber: xpathElems.length };
          })
          .filter(({isCommon }) => isCommon)
          .sort(sortByTargetNumberAndIndex);
      
      if(results.length === 0) {
        return undefined;
      } else {
        return {
          xpath: results[0].xpath,
          index: j,
          targetNumber: results[0].targetNumber
        };
      }
    })
    .filter(s => s !== undefined)
    .sort(sortByTargetNumberAndIndex);
  
  if(outerResults.length === 0) {
    return undefined;
  } else {
    return outerResults[0].xpath;
  }
};

document.onmouseover = (e) => {
  if(e.target) pointedElement = e.target;
};

let lastHighlighted: HTMLElement[] = [];

document.onkeydown = (e) => {
  if(e.key === 'a') {
    if(pointedElement !== undefined) {
      const xpaths = removeAfterUnique(genXPaths(pointedElement as any, props));
      console.log(xpaths);
      
      addedXPaths.push({
        xpaths: xpaths,
        element: getOneElement(xpaths[xpaths.length - 1])
      });
      
      resetHightlight(lastHighlighted);
      setHighlight(addedXPaths.map(e => e.element) as any, 'red');
      
      const union = getUnion(addedXPaths);
      console.log(union);
      if(union !== undefined && addedXPaths.length >= 2) {
        setHighlight([...enumrateXPath(document, union)] as any, 'blue');
        lastHighlighted = [...enumrateXPath(document, union)] as any;
        
        const text = lastHighlighted.map(e => e.innerText).join('\n');
        navigator.clipboard.writeText(text).then(e => {
          console.log('Copied!!');
        });
      }
    }
  }
  
  if(e.key === 'c') {
    resetHightlight(addedXPaths.map(p => p.element) as any);
    addedXPaths = [];
    resetHightlight(lastHighlighted);
    lastHighlighted = [];
  }
}
