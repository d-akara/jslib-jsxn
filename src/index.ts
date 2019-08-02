// TODO
// log suggested rules when ambiguous 
// auto generate rules where ambiguous
//   all elements with child elements and attributes of same name
//   all elements that are lists
// cache proxies with symbol references
// make iterable, compatible with JSON.stringify

export interface Attribute {
    name: string
    localName: string
    value: string
}

export interface Element {
    attributes: ArrayLike<Attribute>
    children: ArrayLike<Element>
    localName: string
    namespaceURI: string | null
    textContent: string | null
    innerHTML: string | null
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

function map<T>(items: ArrayLike<T>, mapFn: (item:T)=>any) {
    const results = []
    for (let index = 0; index < items.length; index++) {
        const element = items[index];
        results.push(mapFn(element))
    }
    return results
}

export interface Rule {
    key?: string
    asKey?: string
    type?: 'element' | 'elements' | 'attribute' | 'text' | 'any'
    asNamespace?: string
    whenLocalName?: string
    whenNamespace?: string
}

export const AsJson = Symbol('JSON Key')
export const AsJsonString = Symbol('JSON String Key')
export const AsXml = Symbol('XML Element Key')

export interface JsonObject {
    [key:string]: any
    [AsJsonString]: string
    [AsJson]: any
    [AsXml]: Element
}

interface JsxnOptions {
    strict: boolean
    cardinality: 'many' | 'one'
}

/**
 * Creates a JSON representation of XML using a Proxy
 * Should work with any DOM conforming to standard - https://dom.spec.whatwg.org/
 * @param element A DOM Element
 * @param rules optional list of rules to define how to resolve object key values
 */
export function jsxn(element:Element, rules:Rule[] = [{type:'any'}]):JsonObject {
    return makeXmlProxy(element, rules) as unknown as JsonObject
}

function makeXmlProxy(element:Element, rules:Rule[]):Element {
    const staticValueProxy:any = new Proxy(element, {
        get(target, key) {
            if (key === AsJsonString) return JSON.stringify(staticValueProxy)
            else if (key === AsJson) return JSON.parse(JSON.stringify(staticValueProxy))
            else if (key === AsXml) return target

            if (typeof key !== 'string') return undefined

            const rule = resolveFirstMatchingRule(rules, target, key)

            if (rule.asKey) key = rule.asKey

            if (rule.type === 'any') {
                const element = resolveElementProxy(target, key, rules, rule)
                // TODO check if attribute name collision
                if (element) return element

                const attribute = findAttribute(target, key)
                if (attribute) return attribute.value
            }

            else if (rule.type === 'attribute') {
                const attribute = findAttribute(target, key)
                if (attribute) return attribute.value
            }
            
            else if (rule.type === 'element') {
                const element = resolveElementProxy(target, key, rules, rule)
                if (element) return element
            }

            else if (rule.type === 'elements') {
                const elements = filter(target.children, element => element.localName === key)
                return elements.map(element => makeXmlProxy(element, rules))
            }

            else if (rule.type === 'text') {
                const element = findElement(target, key, rules, rule)
                if (element) return elementText(element)
            }

            return undefined
        },

        ownKeys(target) {
            // TODO detect collisions
            let keys = map(target.children, element => element.localName)
            const attributeKeys = filter(target.attributes, attribute => !(attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns'))
            keys = keys.concat(map(attributeKeys, attribute => attribute.localName))
            const uniqueKeys = new Set(keys)
            return Array.from(uniqueKeys.keys())
        },

        getOwnPropertyDescriptor(target, prop) {
            return { configurable: true, enumerable: true }
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

function elementText(element:Element) {
    if (element.textContent) return element.textContent

    // Discovered an instance where slimdom didn't have the textContent attribute, but only innerHTML.  
    // Seems like a bug, but his is a work around for now
    if (element.innerHTML) return element.innerHTML
}

function findElement(target:Element, key:string, rules:Rule[], currentRule:Rule) {
    // TODO detect multiple matches as ambiguous result
    const element = find(target.children, element => {
        if (element.localName !== key) return false
        if (currentRule.asNamespace && currentRule.asNamespace !== element.namespaceURI) return false
        return true
    })
    return element
}

function findAttribute(target:Element, key:string) {
    // TODO detect multiple matches as ambiguous result
    const attribute = find(target.attributes, attribute => attribute.localName === key && !(attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns'))
    return attribute
}

function resolveElementProxy(target:Element, key:string, rules:Rule[], currentRule:Rule) {
    const element = findElement(target, key, rules, currentRule)

    if (element) {
        // no child elements or attributes, resolve as text.
        if (element.childElementCount === 0 && element.attributes.length === 0) return elementText(element)
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