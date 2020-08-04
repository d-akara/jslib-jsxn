// TODO
// log suggested rules when ambiguous 
// auto generate rules where ambiguous
//   all elements with child elements and attributes of same name
//   all elements that are lists
// cache proxies with symbol references
// make iterable, compatible with JSON.stringify
// 

export interface Node {
    localName: string
    namespaceURI: string | null
}

export interface Attribute extends Node {
    name: string
    value: string
}

export interface Element extends Node {
    attributes: ArrayLike<Attribute>
    children: ArrayLike<Element>
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

function forEach<T>(items: ArrayLike<T>, eachFn: (item:T)=>any) {
    for (let index = 0; index < items.length; index++) {
        const element = items[index];
        eachFn(element)
    }
}

function elementInfo(element:Element) {
    return {
        localName: element.localName,
        namespaceURI: element.namespaceURI
    }
}

function attributeInfo(attribute:Attribute) {
    return {
        name: attribute.name,
        localname: attribute.localName,
        value: attribute.value
    }
}

function resolveElementAsText(element:Element, rule:Rule, options:JsxnOptions) {
    if (rule.type === 'text') {
        return elementText(element)
    }
    // no child elements or attributes, resolve as text.
    if (element.childElementCount === 0) {
        // has no attributes or it has attributes but they are all namespace directives
        if (element.attributes.length === 0 || !containsNormalAttributes(element))
            return elementText(element)
    }
    return null
}

export interface Rule {
    element?: string
    attribute?: string
    asKey?: string
    type?: 'single' | 'multiple' | 'text' | 'none'
    namespace?: string
}

export interface JsonObject {
    [key:string]: any

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
export function jsxn(element:Element, rules:Rule[] = [{type:'single'}], options:JsxnOptions = {convertKeysToCamelCase:true}):JsonObject {
    return xmlElementToJson(element, rules, options) as unknown as JsonObject
}

function xmlElementToJson(target:Element, rules:Rule[], options:JsxnOptions) {
    const jsonElement:any = {}

    const rule = resolveFirstMatchingRule(rules, target, 'element')
    const textOfElement = resolveElementAsText(target, rule, options)
    if (textOfElement) return textOfElement

    forEach(target.children, element => {
        const rule = resolveFirstMatchingRule(rules, element, 'element')
        let key = resolveLocalName(element.localName, options)
        if (rule.asKey) key = rule.asKey

        if (rule.type === 'multiple') {
            if (!jsonElement[key]) jsonElement[key] = []
            jsonElement[key].push(xmlElementToJson(element, rules, options))
        } else if (jsonElement[key]) {
            // skip already contains value don't override
        } else if (rule.type === 'none') {
            // skip
        } else {
            jsonElement[key] = xmlElementToJson(element, rules, options)
        }
        console.log(rule, elementInfo(element))
    })
    
    forEach(target.attributes, attribute => {
        const rule = resolveFirstMatchingRule(rules, attribute, 'attribute')
        let key = resolveLocalName(attribute.name, options)
        if (rule.asKey) key = rule.asKey
        
        if (jsonElement[key]) {
            // skip already contains value don't override
        } else if ((attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns')) {
            // skip
        } else {
            jsonElement[key] = attribute.value
        }
        console.log(rule, attributeInfo(attribute))
    })

    
    return jsonElement
}

function resolveFirstMatchingRule(rules:Rule[], target:Node, nodeType: 'element' | 'attribute') {
    let rule = rules.filter(rule => rule[nodeType]).find(rule => shouldRuleApply(target, rule))
    if (!rule) rule = {type:'single'}
    if (!rule.type) rule.type = 'single' // use any as default if not set
    return rule
}

function elementText(element:Element) {
    if (element.textContent) return element.textContent

    // Discovered an instance where slimdom didn't have the textContent attribute, but only innerHTML.  
    // Seems like a bug, but his is a work around for now
    if (element.innerHTML) return element.innerHTML
}

function resolveLocalName(localName:string, options:JsxnOptions) {
    return options.convertKeysToCamelCase ? toCamelCase(localName) : localName
}

function containsNormalAttributes(target:Element) {
    const normalElementExists = find(target.attributes, attribute => !(attribute.name.startsWith('xmlns:') || attribute.name === 'xmlns'))
    return !!normalElementExists
}

function shouldRuleApply(currentElement:Node, rule:Rule): boolean {
    const ruleLocalName = rule.element || rule.attribute
    if (ruleLocalName && ruleLocalName !== currentElement.localName) return false
    return isRuleNamespaceMatch(currentElement, rule)
}

function isRuleNamespaceMatch(currentElement:Node, rule:Rule) {
    if (rule.namespace && rule.namespace !== currentElement.namespaceURI) return false
    return true
}

function toCamelCase(input: string) {
    return input.replace(/([-_][a-z])/ig, ($1) => {
      return $1.toUpperCase()
        .replace('-', '')
        .replace('_', '');
    });
};