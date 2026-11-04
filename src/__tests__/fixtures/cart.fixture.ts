/**
 * A real `GET /api/cart` drive payload (November 2026), cut down to four lines.
 * Store and basket identifiers are replaced; prices, promotions and structure are
 * as Carrefour returned them.
 */
export const cartPayload = {
  "cart": {
    "remainedAmount": 5.6,
    "totalAmount": 11.56,
    "totalAmountWithFees": 11.56,
    "totalCardSaving": 0.2,
    "totalDiscount": 0.41,
    "totalEarnings": 0.2,
    "totalFees": 1.75,
    "totalPrice": 9.81,
    "totalProductsPrice": 10.22,
    "totalSavings": 0.41,
    "deliveryFees": 0,
    "type": "drive_clcv",
    "cartID": "<REDACTED>",
    "currency": "€",
    "isSlotAvailable": true,
    "isSlotBooked": false,
    "slotRef": "00000000-0000-0000-0000-000000000000",
    "storeRef": "999",
    "nbUnavailable": 0,
    "nbProducts": 4,
    "totalAvailableQuantity": 4,
    "facilityServiceId": "0999-999-999",
    "pickupMode": "PICKING_DRIVE",
    "items": [
      {
        "category": "Charcuterie et Traiteur",
        "products": [
          {
            "counter": 1,
            "totalItemPrice": 1.19,
            "totalItemPriceWithoutPromo": 1.19,
            "totalItemDiscount": 0,
            "totalItemCardSaving": 0,
            "isStockOff": false,
            "isFree": false,
            "available": true,
            "isNonFood": false,
            "product": {
              "type": "product",
              "id": "3270190204008",
              "attributes": {
                "ean": "3270190204008",
                "title": "Pâte Feuilletée Pur Beurre CARREFOUR ORIGINAL",
                "brand": "CARREFOUR ORIGINAL",
                "packaging": "le paquet de 230g",
                "format": "230g",
                "offerServiceId": "0999-999-999",
                "topCategoryName": "Charcuterie et Traiteur",
                "images": {
                  "main": "https://media.carrefour.fr/medias/example.jpg"
                },
                "offers": {
                  "3270190204008": {
                    "0999-999-999": {
                      "type": "offer",
                      "id": "0999-999-999",
                      "attributes": {
                        "availability": {
                          "indispensable": false,
                          "purchasable": true,
                          "stopped": false,
                          "suspended": false,
                          "suspensionReason": null,
                          "hasLowQuantity": false
                        },
                        "price": {
                          "price": 1.19,
                          "taxMessage": "",
                          "unitOfMeasure": "KG",
                          "perUnit": 5.17,
                          "perUnitLabel": "5.17 € / KG"
                        },
                        "ordering": {
                          "min": 1,
                          "step": 1,
                          "max": 50
                        },
                        "offerServiceId": "0999-999-999",
                        "ean": "3270190204008",
                        "promotion": null
                      }
                    }
                  }
                }
              }
            }
          }
        ],
        "discounts": []
      },
      {
        "category": "Epicerie salée",
        "products": [
          {
            "counter": 1,
            "totalItemPrice": 1.24,
            "totalItemPriceWithoutPromo": 1.65,
            "totalItemDiscount": 0.41,
            "totalItemCardSaving": 0,
            "isStockOff": false,
            "isFree": false,
            "available": true,
            "isNonFood": false,
            "product": {
              "type": "product",
              "id": "3083681040609",
              "attributes": {
                "ean": "3083681040609",
                "title": "Haricots rouges façon Chili BONDUELLE",
                "brand": "BONDUELLE",
                "packaging": "la boite de 400g",
                "format": "400g",
                "offerServiceId": "0999-999-999",
                "topCategoryName": "Epicerie salée",
                "images": {
                  "main": "https://media.carrefour.fr/medias/example.jpg"
                },
                "offers": {
                  "3083681040609": {
                    "0999-999-999": {
                      "type": "offer",
                      "id": "0999-999-999",
                      "attributes": {
                        "availability": {
                          "indispensable": false,
                          "purchasable": true,
                          "stopped": false,
                          "suspended": false,
                          "suspensionReason": null,
                          "hasLowQuantity": false
                        },
                        "price": {
                          "price": 1.65,
                          "taxMessage": "",
                          "unitOfMeasure": "KG",
                          "perUnit": 3.1,
                          "perUnitLabel": "3.10 € / KG"
                        },
                        "ordering": {
                          "min": 1,
                          "step": 1,
                          "max": 50
                        },
                        "offerServiceId": "0999-999-999",
                        "ean": "3083681040609",
                        "promotion": {
                          "type": "promo",
                          "label": "1 acheté = 25% de remise",
                          "isLoyalty": false,
                          "isPromo": true,
                          "isPrixBarre": true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ],
        "discounts": []
      },
      {
        "category": "Hygiène et Beauté",
        "products": [
          {
            "counter": 1,
            "totalItemPrice": 4.79,
            "totalItemPriceWithoutPromo": 4.79,
            "totalItemDiscount": 0,
            "totalItemCardSaving": 0.2,
            "isStockOff": false,
            "isFree": false,
            "available": true,
            "isNonFood": false,
            "product": {
              "type": "product",
              "id": "3560070150403",
              "attributes": {
                "ean": "3560070150403",
                "title": "Papier Toilette Doux Et Épais Triple Épaisseur Décoré Essential CARREFOUR ESSENTIAL",
                "brand": "CARREFOUR ESSENTIAL",
                "packaging": "les 12 rouleaux",
                "format": "x12",
                "offerServiceId": "0999-999-999",
                "topCategoryName": "Hygiène et Beauté",
                "images": {
                  "main": "https://media.carrefour.fr/medias/example.jpg"
                },
                "offers": {
                  "3560070150403": {
                    "0999-999-999": {
                      "type": "offer",
                      "id": "0999-999-999",
                      "attributes": {
                        "availability": {
                          "indispensable": false,
                          "purchasable": true,
                          "stopped": false,
                          "suspended": false,
                          "suspensionReason": null,
                          "hasLowQuantity": false
                        },
                        "price": {
                          "price": 4.79,
                          "taxMessage": "",
                          "unitOfMeasure": "U",
                          "perUnit": 0.4,
                          "perUnitLabel": "0.40 € / U"
                        },
                        "ordering": {
                          "min": 1,
                          "step": 1,
                          "max": 50
                        },
                        "offerServiceId": "0999-999-999",
                        "ean": "3560070150403",
                        "promotion": null
                      }
                    }
                  }
                }
              }
            }
          }
        ],
        "discounts": []
      },
      {
        "category": "Epicerie sucrée",
        "products": [
          {
            "counter": 1,
            "totalItemPrice": 2.59,
            "totalItemPriceWithoutPromo": 2.59,
            "totalItemDiscount": 0,
            "totalItemCardSaving": 0,
            "isStockOff": false,
            "isFree": false,
            "available": true,
            "isNonFood": false,
            "product": {
              "type": "product",
              "id": "8723400944171",
              "attributes": {
                "ean": "8723400944171",
                "title": "Chewing gum greenfresh HOLLYWOOD",
                "brand": "HOLLYWOOD",
                "packaging": "les 5 boites de 14g",
                "format": "x50",
                "offerServiceId": "0999-999-999",
                "topCategoryName": "Epicerie sucrée",
                "images": {
                  "main": "https://media.carrefour.fr/medias/example.jpg"
                },
                "offers": {
                  "8723400944171": {
                    "0999-999-999": {
                      "type": "offer",
                      "id": "0999-999-999",
                      "attributes": {
                        "availability": {
                          "indispensable": false,
                          "purchasable": true,
                          "stopped": false,
                          "suspended": false,
                          "suspensionReason": null,
                          "hasLowQuantity": false
                        },
                        "price": {
                          "price": 2.59,
                          "taxMessage": "",
                          "unitOfMeasure": "KG",
                          "perUnit": 37,
                          "perUnitLabel": "37.00 € / KG"
                        },
                        "ordering": {
                          "min": 1,
                          "step": 1,
                          "max": 50
                        },
                        "offerServiceId": "0999-999-999",
                        "ean": "8723400944171",
                        "promotion": {
                          "type": "ri",
                          "label": "Le 2ème à -50%",
                          "isLoyalty": false,
                          "isPromo": false,
                          "isPrixBarre": false
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ],
        "discounts": []
      }
    ],
    "slot": {
      "date": {
        "begin": "2026-11-05T07:00:00+00:00",
        "end": "2026-11-05T07:30:00+00:00",
        "cutoff": null
      },
      "hour": "07h00",
      "ref": "00000000-0000-0000-0000-000000000000",
      "slice": "2A",
      "isDefault": true,
      "isBooked": false,
      "isAvailable": true,
      "dayMaxCapacity": null,
      "dayUsedCapacity": null,
      "fillRate": null,
      "expiresInMinutes": null
    },
    "promoCodes": [],
    "slotFailures": [],
    "returnableBags": {
      "quantity": 5,
      "unitPrice": 0.35,
      "totalPrice": 1.75,
      "totalPriceWithoutDiscount": 1.75
    },
    "discountImmediate": {
      "totalAmount": 0.41,
      "items": [
        {
          "type": "GENERAL",
          "totalAmount": 0.41
        }
      ]
    },
    "discountDiffered": {
      "totalAmount": 0.2,
      "totalBonusAmount": 0,
      "items": [
        {
          "type": "COUPON",
          "totalAmount": 0.2
        }
      ]
    }
  },
  "marketplace": {
    "subBaskets": [],
    "amounts": {
      "totalAmount": 0,
      "totalPrice": 0,
      "totalSavings": 0
    }
  },
  "additionalOrders": [],
  "nonFoodDeliveryCart": [],
  "preorder": [],
  "meta": {
    "errors": [],
    "hasPartnerStoreConflict": false
  },
  "endPoints": {
    "cart": "/api/cart",
    "product": "/api/cart/product/{ean}"
  }
};
