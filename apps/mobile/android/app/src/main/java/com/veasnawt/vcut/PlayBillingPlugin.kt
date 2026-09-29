package com.veasnawt.vcut

import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.ConcurrentHashMap

/**
 * Google Play Billing (v7) plugin for VCut Android.
 * Connects the Capacitor web layer to native Google Play Billing client.
 * Handles Product queries, Purchase flow launching, Purchase status updates,
 * Consumable consumption, and Purchase restoration.
 */
@CapacitorPlugin(name = "PlayBilling")
class PlayBillingPlugin : Plugin(), PurchasesUpdatedListener {

    private var billingClient: BillingClient? = null
    private var isConnected = false
    private var activePurchaseCall: PluginCall? = null
    private val cachedProductDetails = ConcurrentHashMap<String, ProductDetails>()

    override fun load() {
        super.load()
        initBillingClient()
    }

    private fun initBillingClient() {
        val pendingParams = PendingPurchasesParams.newBuilder()
            .enableOneTimeProducts()
            .enablePrepaidPlans()
            .build()

        billingClient = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases(pendingParams)
            .build()

        connectClient(null)
    }

    private fun connectClient(onConnected: ((Boolean) -> Unit)?) {
        val client = billingClient ?: return onConnected?.invoke(false) ?: Unit
        if (client.isReady) {
            isConnected = true
            onConnected?.invoke(true)
            return
        }

        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                isConnected = (billingResult.responseCode == BillingClient.BillingResponseCode.OK)
                onConnected?.invoke(isConnected)
            }

            override fun onBillingServiceDisconnected() {
                isConnected = false
            }
        })
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        connectClient { ready ->
            val res = JSObject()
            res.put("available", ready)
            call.resolve(res)
        }
    }

    @PluginMethod
    fun queryProducts(call: PluginCall) {
        val productIdsArray = call.getArray("productIds")
        val productTypeStr = call.getString("productType", "subs")?.lowercase()
        if (productIdsArray == null || productIdsArray.length() == 0) {
            call.reject("productIds must be a non-empty array")
            return
        }

        val billingType = if (productTypeStr == "inapp") {
            BillingClient.ProductType.INAPP
        } else {
            BillingClient.ProductType.SUBS
        }

        connectClient { ready ->
            if (!ready) {
                call.reject("Google Play Billing client not connected")
                return@connectClient
            }

            val productList = mutableListOf<QueryProductDetailsParams.Product>()
            for (i in 0 until productIdsArray.length()) {
                val id = productIdsArray.getString(i)
                productList.add(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(billingType)
                        .build()
                )
            }

            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build()

            billingClient?.queryProductDetailsAsync(params) { billingResult, result ->
                if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject("Failed to query product details: ${billingResult.debugMessage} (code ${billingResult.responseCode})")
                    return@queryProductDetailsAsync
                }

                val queryProductDetailsList = result.productDetailsList
                val results = JSArray()
                for (details in queryProductDetailsList) {
                    cachedProductDetails[details.productId] = details
                    val obj = JSObject()
                    obj.put("productId", details.productId)
                    obj.put("title", details.title)
                    obj.put("description", details.description)
                    obj.put("productType", details.productType)

                    if (details.productType == BillingClient.ProductType.SUBS) {
                        val offers = details.subscriptionOfferDetails
                        if (!offers.isNullOrEmpty()) {
                            val baseOffer = offers.firstOrNull { it.offerId == null } ?: offers[0]
                            val pricingPhase = baseOffer.pricingPhases.pricingPhaseList.firstOrNull()
                            obj.put("offerToken", baseOffer.offerToken)
                            obj.put("basePlanId", baseOffer.basePlanId)
                            if (pricingPhase != null) {
                                obj.put("formattedPrice", pricingPhase.formattedPrice)
                                obj.put("priceAmountMicros", pricingPhase.priceAmountMicros)
                                obj.put("priceCurrencyCode", pricingPhase.priceCurrencyCode)
                                obj.put("billingPeriod", pricingPhase.billingPeriod)
                            }
                        }
                    } else {
                        val oneTime = details.oneTimePurchaseOfferDetails
                        if (oneTime != null) {
                            obj.put("formattedPrice", oneTime.formattedPrice)
                            obj.put("priceAmountMicros", oneTime.priceAmountMicros)
                            obj.put("priceCurrencyCode", oneTime.priceCurrencyCode)
                        }
                    }
                    results.put(obj)
                }

                val response = JSObject()
                response.put("products", results)
                call.resolve(response)
            }
        }
    }

    @PluginMethod
    fun launchPurchase(call: PluginCall) {
        val productId = call.getString("productId") ?: return call.reject("Missing productId")
        val productTypeStr = call.getString("productType", "subs")?.lowercase()
        val offerTokenParam = call.getString("offerToken")
        val obfuscatedAccountId = call.getString("obfuscatedAccountId")

        connectClient { ready ->
            if (!ready) {
                call.reject("Google Play Billing client not connected")
                return@connectClient
            }

            val details = cachedProductDetails[productId]
            if (details == null) {
                // If not cached, query first
                val billingType = if (productTypeStr == "inapp") BillingClient.ProductType.INAPP else BillingClient.ProductType.SUBS
                val params = QueryProductDetailsParams.newBuilder()
                    .setProductList(listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(billingType)
                            .build()
                    ))
                    .build()

                billingClient?.queryProductDetailsAsync(params) { billingResult, result ->
                    val queryProductDetailsList = result.productDetailsList
                    if (billingResult.responseCode != BillingClient.BillingResponseCode.OK || queryProductDetailsList.isEmpty()) {
                        call.reject("Product not found in Google Play: $productId")
                        return@queryProductDetailsAsync
                    }
                    val found = queryProductDetailsList[0]
                    cachedProductDetails[productId] = found
                    startBillingFlow(call, found, offerTokenParam, obfuscatedAccountId)
                }
            } else {
                startBillingFlow(call, details, offerTokenParam, obfuscatedAccountId)
            }
        }
    }

    private fun startBillingFlow(
        call: PluginCall,
        details: ProductDetails,
        offerTokenParam: String?,
        obfuscatedAccountId: String?
    ) {
        val productParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)

        if (details.productType == BillingClient.ProductType.SUBS) {
            val token = offerTokenParam
                ?: details.subscriptionOfferDetails?.firstOrNull()?.offerToken
            if (token != null) {
                productParamsBuilder.setOfferToken(token)
            }
        }

        val flowParamsBuilder = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParamsBuilder.build()))

        if (!obfuscatedAccountId.isNullOrEmpty()) {
            flowParamsBuilder.setObfuscatedAccountId(obfuscatedAccountId)
        }

        activePurchaseCall = call

        Handler(Looper.getMainLooper()).post {
            val activity = activity
            if (activity == null) {
                activePurchaseCall?.reject("Activity not available to launch billing flow")
                activePurchaseCall = null
                return@post
            }
            val client = billingClient ?: return@post
            val result = client.launchBillingFlow(activity, flowParamsBuilder.build())
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                activePurchaseCall?.reject("Failed to launch billing flow: ${result.debugMessage} (code ${result.responseCode})")
                activePurchaseCall = null
            }
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        val call = activePurchaseCall
        activePurchaseCall = null

        val responseCode = billingResult.responseCode
        if (responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            val purchasesArray = JSArray()
            for (p in purchases) {
                purchasesArray.put(serializePurchase(p))
            }
            val res = JSObject()
            res.put("success", true)
            res.put("purchases", purchasesArray)

            call?.resolve(res)
            notifyListeners("onPurchaseUpdated", res, true)
            return
        }

        if (responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            val res = JSObject()
            res.put("success", false)
            res.put("canceled", true)
            call?.resolve(res)
            return
        }

        val errorObj = JSObject()
        errorObj.put("success", false)
        errorObj.put("errorCode", responseCode)
        errorObj.put("message", billingResult.debugMessage)

        call?.reject("Billing error: ${billingResult.debugMessage} (code $responseCode)", errorObj)
        notifyListeners("onPurchaseError", errorObj, true)
    }

    @PluginMethod
    fun queryPurchases(call: PluginCall) {
        connectClient { ready ->
            if (!ready) {
                call.reject("Google Play Billing client not connected")
                return@connectClient
            }

            val client = billingClient ?: return@connectClient call.reject("Client null")
            val allPurchases = JSArray()

            // 1. Query Subscriptions
            val subsParams = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()

            client.queryPurchasesAsync(subsParams) { subsResult, subsList ->
                if (subsResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    for (p in subsList) {
                        allPurchases.put(serializePurchase(p))
                    }
                }

                // 2. Query In-App Purchases
                val inappParams = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()

                client.queryPurchasesAsync(inappParams) { inappResult, inappList ->
                    if (inappResult.responseCode == BillingClient.BillingResponseCode.OK) {
                        for (p in inappList) {
                            allPurchases.put(serializePurchase(p))
                        }
                    }

                    val res = JSObject()
                    res.put("purchases", allPurchases)
                    call.resolve(res)
                }
            }
        }
    }

    @PluginMethod
    fun consumePurchase(call: PluginCall) {
        val purchaseToken = call.getString("purchaseToken") ?: return call.reject("Missing purchaseToken")
        connectClient { ready ->
            if (!ready) return@connectClient call.reject("Not connected")

            val params = ConsumeParams.newBuilder()
                .setPurchaseToken(purchaseToken)
                .build()

            billingClient?.consumeAsync(params) { billingResult, _ ->
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    val res = JSObject()
                    res.put("success", true)
                    call.resolve(res)
                } else {
                    call.reject("Consume failed: ${billingResult.debugMessage} (code ${billingResult.responseCode})")
                }
            }
        }
    }

    @PluginMethod
    fun acknowledgePurchase(call: PluginCall) {
        val purchaseToken = call.getString("purchaseToken") ?: return call.reject("Missing purchaseToken")
        connectClient { ready ->
            if (!ready) return@connectClient call.reject("Not connected")

            val params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchaseToken)
                .build()

            billingClient?.acknowledgePurchase(params) { billingResult ->
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    val res = JSObject()
                    res.put("success", true)
                    call.resolve(res)
                } else {
                    call.reject("Acknowledge failed: ${billingResult.debugMessage} (code ${billingResult.responseCode})")
                }
            }
        }
    }

    private fun serializePurchase(p: Purchase): JSObject {
        val obj = JSObject()
        obj.put("orderId", p.orderId)
        obj.put("purchaseToken", p.purchaseToken)
        obj.put("purchaseTime", p.purchaseTime)
        obj.put("purchaseState", p.purchaseState)
        obj.put("isAcknowledged", p.isAcknowledged)
        obj.put("isAutoRenewing", p.isAutoRenewing)

        val productsArray = JSArray()
        for (prod in p.products) {
            productsArray.put(prod)
        }
        obj.put("products", productsArray)
        obj.put("originalJson", p.originalJson)
        return obj
    }
}
