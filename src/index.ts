// TODO
// log suggested rules when ambiguous 
// auto generate rules where ambiguous
//   all elements with child elements and attributes of same name
//   all elements that are lists
// cache proxies with symbol references
// make iterable, compatible with JSON.stringify

export interface Attribute {
    name: string
    value: string
}

export interface Element {
    attributes: ArrayLike<Attribute>
    children: ArrayLike<Element>
    localName: string
    namespaceURI: string | null
    textContent: string | null
    readonly childElementCount: number
}

function find<T>(items: ArrayLike<T>, findFn: (item:T)=>boolean):T|null {
    for (let index = 0; index < items.length; index++) {
        const element = items[index];
        if (findFn(element)) return element
    }
    return null
}

function filter<T>(items: ArrayLike<T>, findFn: (item:T)=>boolean):T[] {
    const found = []
    for (let index = 0; index < items.length; index++) {
        const element = items[index];
        if (findFn(element)) found.push(element)
    }
    return found
}

export interface Rule {
    key?: string
    asKey?: string
    type?: 'element' | 'elements' | 'attribute' | 'any'
    asNamespace?: string
    whenLocalName?: string
    whenNamespace?: string
}

export function makeXmlProxy(element:Element, rules:Rule[] = [{type:'any'}]):Element {
    const staticValueProxy = new Proxy(element, {
        get: function(target, key:string) {
            const rule = resolveFirstMatchingRule(rules, target, key)

            if (rule.asKey) key = rule.asKey

            if (rule.type === 'any') {
                const element = resolveElementProxy(target, key, rules, rule)
                if (element) return element

                const attribute = find(target.attributes, attribute => attribute.name === key)
                if (attribute) return attribute.value
            }

            if (rule.type === 'attribute') {
                const attribute = find(target.attributes, attribute => attribute.name === key)
                if (attribute) return attribute.value
            }
            
            if (rule.type === 'element') {
                const element = resolveElementProxy(target, key, rules, rule)
                if (element) return element
            }

            if (rule.type === 'elements') {
                const elements = filter(target.children, element => element.localName === key)
                return elements.map(element => makeXmlProxy(element, rules))
            }

            return undefined
        }
    })
    return staticValueProxy
}

function resolveFirstMatchingRule(rules:Rule[], target:Element, key:string) {
    let rule = rules.find(rule => evaluateRule(target, rule, key))
    if (!rule) rule = {type:'any'}
    if (!rule.type) rule.type = 'any' // use any as default if not set
    return rule
}

function resolveElementProxy(target:Element, key:string, rules:Rule[], currentRule:Rule) {
    const element = find(target.children, element => {
        if (element.localName !== key) return false
        if (currentRule.asNamespace && currentRule.asNamespace !== element.namespaceURI) return false
        return true
    })

    if (element) {
        // no child elements or attributes, resolve as text.
        if (element.childElementCount === 0 && element.attributes.length === 0) return element.textContent
        // wrap in proxy
        return makeXmlProxy(element, rules)
    }
    return null
}

function evaluateRule(currentElement:Element, rule:Rule, requestedKey: string): boolean {
    if (rule.key && rule.key !== requestedKey) return false
    if (rule.whenLocalName && rule.whenLocalName !== currentElement.localName) return false
    if (rule.whenNamespace && rule.whenNamespace !== currentElement.namespaceURI) return false
    return true
}