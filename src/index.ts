// TODO
// log suggested rules when ambiguous 
// auto generate rules where ambiguous
//   all elements with child elements and attributes of same name
//   all elements that are lists
// cache proxies with symbol references
// make iterable, compatible with JSON.stringify
// 

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
    strict?: boolean
    cardinality?: 'many' | 'one'
    convertKeysToCamelCase?: boolean
}

/**
 * Creates a JSON representation of XML using a Proxy
 * Should work with any DOM conforming to standard - https://dom.spec.whatwg.org/
 * @param element A DOM Element
 * @param rules optional list of rules to define how to resolve object key values
 */
export function jsxn(element:Element, rules:Rule[] = [{type:'any'}], options:JsxnOptions = {convertKeysToCamelCase:true}):JsonObject {
    return makeXmlProxy(element, rules, options) as unknown as JsonObject
}

function makeXmlProxy(element:Element, rules:Rule[], options:JsxnOptions):Element {
    const staticValueProxy:any = new Proxy(element, {
        get(target, key) {
            if (key === AsJsonString) return JSON.stringify(staticValueProxy)
            else if (key === AsJson) return JSON.parse(JSON.stringify(staticValueProxy))
            else if (key === AsXml) return target

            if (typeof key !== 'string') return undefined

            const rule = resolveFirstMatchingRule(rules, target, key)

            if (rule.asKey) key = rule.asKey

            if (rule.type === 'any') {
                const element = resolveElementProxy(target, key, rules, rule, options)
                // TODO check if attribute name collision
                if (element) return element

                const attribute = findAttribute(target, key, options)
                if (attribute) return attribute.value
            }

            else if (rule.type === 'attribute') {
                const attribute = findAttribute(target, key, options)
                if (attribute) return attribute.value
            }
            
            else if (rule.type === 'element') {
                const element = resolveElementProxy(target, key, rules, rule, options)
                if (element) return element
            }

            else if (rule.type === 'elements') {
                const elements = filter(target.children, element => element.localName === key)
                return elements.map(element => makeXmlProxy(element, rules, options))
            }

            else if (rule.type === 'text') {
                const element = findElement(target, key, rules, rule, options)
                if (element) return elementText(element)
            }

            return undefined
        },

        ownKeys(target) {
            // TODO detect collisions
            let keys = map(target.children, element => element.localName)
            const attributeKeys = filter(target.attributes, attribute => !(attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns'))
            keys = keys.concat(map(attributeKeys, attribute => attribute.localName))

            keys.forEach((key, index) => {
                if (options.convertKeysToCamelCase)
                    keys[index] = toCamelCase(keys[index])

                const rule = rules.find(rule => evaluateRuleByAsKey(target, rule, key))
                if (rule && rule.asKey)
                    keys[index] = rule.key
            })

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

function findElement(target:Element, key:string, rules:Rule[], currentRule:Rule, options:JsxnOptions) {
    // TODO detect multiple matches as ambiguous result
    const element = find(target.children, element => {
        const localName = options.convertKeysToCamelCase ? toCamelCase(element.localName) : element.localName
        if (localName !== key) return false
        if (currentRule.asNamespace && currentRule.asNamespace !== element.namespaceURI) return false
        return true
    })
    return element
}

function containsNormalAttributes(target:Element) {
    const normalElementExists = find(target.attributes, attribute => !(attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns'))
    return !!normalElementExists
}

function findAttribute(target:Element, key:string, options:JsxnOptions) {
    // TODO detect multiple matches as ambiguous result
    const attribute = find(target.attributes, attribute => {
        const localName = options.convertKeysToCamelCase ? toCamelCase(attribute.localName) : attribute.localName
        return localName === key && !(attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns')
    })
    return attribute
}

function resolveElementProxy(target:Element, key:string, rules:Rule[], currentRule:Rule, options:JsxnOptions) {
    const element = findElement(target, key, rules, currentRule, options)

    if (element) {
        // no child elements or attributes, resolve as text.
        if (element.childElementCount === 0) {
            // has no attributes or it has attributes but they are all namespace directives
            if (element.attributes.length === 0 || !containsNormalAttributes(element))
                return elementText(element)
        }
        // wrap in proxy
        return makeXmlProxy(element, rules, options)
    }
    return null
}

function evaluateRule(currentElement:Element, rule:Rule, requestedKey: string): boolean {
    if (rule.key && rule.key !== requestedKey) return false
    return isRuleNamespaceMatch(currentElement, rule)
}

function evaluateRuleByAsKey(currentElement:Element, rule:Rule, asKey: string): boolean {
    if (rule.asKey !== asKey) return false
    return isRuleNamespaceMatch(currentElement, rule)
}

function isRuleNamespaceMatch(currentElement:Element, rule:Rule) {
    if (rule.whenLocalName && rule.whenLocalName !== currentElement.localName) return false
    if (rule.whenNamespace && rule.whenNamespace !== currentElement.namespaceURI) return false
    return true
}

function toCamelCase(input: string) {
    return input.replace(/([-_][a-z])/ig, ($1) => {
      return $1.toUpperCase()
        .replace('-', '')
        .replace('_', '');
    });
};